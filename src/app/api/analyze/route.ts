import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk"
import mammoth from "mammoth"
import { extractText } from "unpdf"
import * as XLSX from "xlsx"

import {
  AnalysisResult,
  AnalysisStreamMessage,
  Finding,
  ReviewEvent,
  RiskFactor,
} from "~/lib/analysis-types"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_FILES = 12
const MAX_FILE_SIZE = 15 * 1024 * 1024
const MAX_RECORDS = 80
const CHUNK_SIZE = 800
const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" })

type JsonRecord = Record<string, string | number | boolean | null>

type ReviewRecord = {
  id: string
  source: string
  location: string
  content: JsonRecord | string
  amount: number | null
  vendor: string | null
  date: string | null
  signals: string[]
}

type ReviewOutcome = {
  finding: Finding | null
  riskScore: number
}

type ChunkUnit = {
  text: string
  location: string
}

type PackedChunk = {
  text: string
  startLocation: string
  endLocation: string
}

const categoryLabels: Record<string, string> = {
  duplicate_or_reused: "Possible duplicate payment",
  threshold_avoidance: "Possible approval avoidance",
  vendor_mismatch: "Vendor and purpose mismatch",
  weak_documentation: "Weak supporting documentation",
  unusual_payment: "Unusual payment pattern",
  no_clear_risk: "No clear risk",
}

function cleanValue(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value
  }

  return String(value).replace(/\s+/g, " ").trim().slice(0, 2_000)
}

function normalizeRow(row: Record<string, unknown>): JsonRecord {
  return Object.fromEntries(
    Object.entries(row)
      .slice(0, 40)
      .map(([key, value]) => [key.slice(0, 120), cleanValue(value)]),
  )
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function sentenceUnits(text: string, location: string): ChunkUnit[] {
  const normalized = normalizeText(text)
  if (!normalized) return []

  return Array.from(sentenceSegmenter.segment(normalized), ({ segment }) => ({
    text: segment.trim(),
    location,
  })).filter(({ text }) => text.length > 0)
}

function splitOversizedUnit(unit: ChunkUnit): ChunkUnit[] {
  if (unit.text.length <= CHUNK_SIZE) return [unit]

  const pieces: ChunkUnit[] = []
  let remaining = unit.text
  while (remaining.length > CHUNK_SIZE) {
    const candidate = remaining.slice(0, CHUNK_SIZE + 1)
    const lastSpace = candidate.lastIndexOf(" ")
    const splitAt = lastSpace >= CHUNK_SIZE / 2 ? lastSpace : CHUNK_SIZE
    pieces.push({ text: remaining.slice(0, splitAt).trim(), location: unit.location })
    remaining = remaining.slice(splitAt).trim()
  }
  if (remaining) pieces.push({ text: remaining, location: unit.location })
  return pieces
}

function packUnits(units: ChunkUnit[]): PackedChunk[] {
  const chunks: PackedChunk[] = []
  let current: PackedChunk | null = null

  for (const unit of units.filter(({ text }) => text.trim()).flatMap(splitOversizedUnit)) {
    const nextLength = current ? current.text.length + 1 + unit.text.length : unit.text.length
    if (current && nextLength > CHUNK_SIZE) {
      chunks.push(current)
      current = null
    }

    if (current) {
      current.text += `\n${unit.text}`
      current.endLocation = unit.location
    } else {
      current = {
        text: unit.text,
        startLocation: unit.location,
        endLocation: unit.location,
      }
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function locationLabel(chunk: PackedChunk): string {
  return chunk.startLocation === chunk.endLocation
    ? chunk.startLocation
    : `${chunk.startLocation}–${chunk.endLocation}`
}

function rowText(row: Record<string, unknown>): string {
  return Object.entries(normalizeRow(row))
    .filter(([, value]) => value !== "" && value !== null)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ")
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(value)
  if (typeof value !== "string") return null

  const normalized = value.replace(/[$,()\s]/g, "").replace(/[^\d.-]/g, "")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.abs(parsed) : null
}

function sumAmountsFromText(text: string): number | null {
  const labeledAmounts = Array.from(
    text.matchAll(
      /(?:amount|total|price|debit|charge|value)[^:\n]{0,30}:\s*\$?\(?([\d,]+(?:\.\d{1,2})?)\)?/gi,
    ),
    (match) => parseNumber(match[1]),
  ).filter((amount): amount is number => amount !== null)

  if (labeledAmounts.length > 0) {
    return labeledAmounts.reduce((sum, amount) => sum + amount, 0)
  }

  const currencyAmounts = Array.from(text.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g), (match) =>
    parseNumber(match[1]),
  ).filter((amount): amount is number => amount !== null)

  return currencyAmounts.length > 0
    ? currencyAmounts.reduce((sum, amount) => sum + amount, 0)
    : null
}

function inferField(record: JsonRecord, pattern: RegExp): string | null {
  const match = Object.entries(record).find(([key, value]) => pattern.test(key) && value !== "")
  return match ? String(match[1]).slice(0, 240) : null
}

function enrichRecord(
  source: string,
  location: string,
  content: JsonRecord | string,
  index: number,
): ReviewRecord {
  const record = typeof content === "string" ? null : content
  const amountEntry = record
    ? Object.entries(record).find(([key]) => /amount|total|price|debit|charge|value/i.test(key))
    : null
  const amountFromText = typeof content === "string" ? sumAmountsFromText(content) : null

  return {
    id: `record-${index + 1}`,
    source,
    location,
    content,
    amount: parseNumber(amountEntry?.[1] ?? amountFromText),
    vendor: record
      ? inferField(record, /vendor|merchant|supplier|payee|counterparty|description/i)
      : null,
    date: record ? inferField(record, /date|posted|created|issued/i) : null,
    signals: [],
  }
}

async function extractRecords(file: File, offset: number): Promise<ReviewRecord[]> {
  const extension = file.name.split(".").pop()?.toLowerCase()
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (extension === "csv" || extension === "xlsx" || extension === "xls") {
    const workbook = XLSX.read(bytes, { type: "array", raw: false })
    let chunkIndex = 0
    return workbook.SheetNames.flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      })
      const units = rows.map((row, index) => ({
        text: rowText(row),
        location: `Row ${index + 2}`,
      }))

      return packUnits(units).map((chunk) =>
        enrichRecord(
          file.name,
          `${sheetName}, ${locationLabel(chunk)}`,
          chunk.text,
          offset + chunkIndex++,
        ),
      )
    })
  }

  if (extension === "pdf") {
    const { text } = await extractText(bytes, { mergePages: false })
    const pages = Array.isArray(text) ? text : [text]
    const units = pages.flatMap((page, pageIndex) => sentenceUnits(page, `Page ${pageIndex + 1}`))
    return packUnits(units).map((chunk, index) =>
      enrichRecord(file.name, locationLabel(chunk), chunk.text, offset + index),
    )
  }

  if (extension === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
    return packUnits(sentenceUnits(value, "Document")).map((chunk, index) =>
      enrichRecord(file.name, `Section ${index + 1}`, chunk.text, offset + index),
    )
  }

  const text = new TextDecoder().decode(bytes)
  if (extension === "json") {
    const parsed: unknown = JSON.parse(text)
    const values = Array.isArray(parsed) ? parsed : [parsed]
    const units = values.map((value, index) => ({
      text: JSON.stringify(value, null, 2) ?? String(value),
      location: `Record ${index + 1}`,
    }))
    return packUnits(units).map((chunk, index) =>
      enrichRecord(file.name, locationLabel(chunk), chunk.text, offset + index),
    )
  }

  return packUnits(sentenceUnits(text, "Document")).map((chunk, index) =>
    enrichRecord(file.name, `Section ${index + 1}`, chunk.text, offset + index),
  )
}

function addCrossRecordSignals(records: ReviewRecord[]) {
  const duplicateGroups = new Map<string, ReviewRecord[]>()
  const sameDayGroups = new Map<string, ReviewRecord[]>()

  for (const record of records) {
    if (!record.vendor || record.amount === null) continue
    const vendor = record.vendor.toLowerCase().replace(/\W/g, "")
    const duplicateKey = `${vendor}:${record.amount.toFixed(2)}`
    duplicateGroups.set(duplicateKey, [...(duplicateGroups.get(duplicateKey) ?? []), record])

    if (record.date) {
      const sameDayKey = `${vendor}:${record.date.toLowerCase()}`
      sameDayGroups.set(sameDayKey, [...(sameDayGroups.get(sameDayKey) ?? []), record])
    }
  }

  for (const group of duplicateGroups.values()) {
    if (group.length > 1) {
      group.forEach((record) =>
        record.signals.push("Same vendor and amount appears more than once"),
      )
    }
  }

  for (const group of sameDayGroups.values()) {
    if (group.length >= 3) {
      group.forEach((record) =>
        record.signals.push("Three or more payments share a vendor and date"),
      )
    }
  }
}

function evidenceFrom(content: ReviewRecord["content"]): string {
  if (typeof content === "string") return content.replace(/\s+/g, " ").trim()

  return Object.entries(content)
    .filter(([, value]) => value !== "" && value !== null)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ")
}

async function reviewRecord(client: TypeSafeClient, record: ReviewRecord): Promise<ReviewOutcome> {
  const result = await client.systemOne({
    state: {
      record: record.content,
      source: { file: record.source, location: record.location },
      deterministic_signals: record.signals,
    },
    questions: {
      suspicious: noul(
        "Does this financial record contain a meaningful indicator of fraud, abuse, or policy evasion?",
        {
          true: "The record contains a specific suspicious characteristic worth investigation",
          false: "The record looks ordinary or lacks enough evidence to justify investigation",
        },
      ),
      vendor_mismatch: noul(
        "Is the stated vendor, merchant, or payee meaningfully inconsistent with the purchase purpose or description?",
      ),
      weak_documentation: noul(
        "Is the business purpose or supporting description unusually vague, evasive, or inadequate for this payment?",
      ),
      category: choice("Which risk category best fits this record?", {
        duplicate_or_reused: "A duplicate payment, reused invoice, or repeated charge",
        threshold_avoidance:
          "Payments appear structured to avoid an approval or reporting threshold",
        vendor_mismatch: "The vendor or merchant does not plausibly match the stated purpose",
        weak_documentation: "The payment lacks an adequate or credible business explanation",
        unusual_payment: "Another unusual payment pattern that merits investigation",
        no_clear_risk: "No clear fraud or policy-evasion signal is present",
      }),
      severity: score(
        "How serious is the financial risk if the suspicious interpretation is correct?",
        ["Negligible", "Low", "Material", "Severe"],
      ),
    },
  })

  const answers = result.answers
  const categoryRisk = 1 - answers.category.probabilities.no_clear_risk
  const severityRisk = answers.severity.score / 3
  const deterministicRisk = record.signals.length ? 1 : 0
  const riskScore =
    0.38 * answers.suspicious.noul +
    0.18 * answers.vendor_mismatch.noul +
    0.14 * answers.weak_documentation.noul +
    0.14 * categoryRisk +
    0.1 * severityRisk +
    0.06 * deterministicRisk

  if (riskScore < 0.46 && record.signals.length === 0) {
    return { finding: null, riskScore }
  }

  const factors: RiskFactor[] = [
    { label: "Suspicious characteristics", probability: answers.suspicious.noul },
    { label: "Vendor mismatch", probability: answers.vendor_mismatch.noul },
    { label: "Weak documentation", probability: answers.weak_documentation.noul },
    ...record.signals.map((label) => ({ label, probability: 1 })),
  ]
    .filter((factor) => factor.probability >= 0.45)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 4)

  const riskLevel = riskScore >= 0.78 ? "critical" : riskScore >= 0.62 ? "high" : "medium"
  const category = answers.category.choice

  return {
    riskScore,
    finding: {
      id: record.id,
      title: categoryLabels[category] ?? "Suspicious financial record",
      category,
      riskLevel,
      riskScore,
      confidence: answers.category.confidence,
      amount: record.amount,
      source: record.source,
      location: record.location,
      factors,
    },
  }
}

export async function POST(request: Request) {
  try {
    if (!process.env.TYPESAFE_API_KEY) {
      return Response.json({ error: "TYPESAFE_API_KEY is not configured." }, { status: 503 })
    }

    const formData = await request.formData()
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File)
    const requestedDelay = Number(formData.get("transitionDelayMs"))
    const transitionDelayMs = Number.isFinite(requestedDelay)
      ? Math.min(3_000, Math.max(0, requestedDelay))
      : 0

    if (files.length === 0) {
      return Response.json({ error: "Add at least one file." }, { status: 400 })
    }
    if (files.length > MAX_FILES) {
      return Response.json(
        { error: `Upload no more than ${MAX_FILES} files at once.` },
        { status: 400 },
      )
    }
    if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      return Response.json({ error: "Each file must be smaller than 15 MB." }, { status: 400 })
    }

    const extracted = await Promise.all(
      files.map((file, index) => extractRecords(file, index * 10_000)),
    )
    const records = extracted.flat().slice(0, MAX_RECORDS)
    if (records.length === 0) {
      return Response.json(
        { error: "No readable records were found in these files." },
        { status: 422 },
      )
    }

    addCrossRecordSignals(records)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (message: AnalysisStreamMessage) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`))
        }

        try {
          const client = new TypeSafeClient({ timeout: 20_000 })
          const reviewed: ReviewOutcome[] = []
          const findings: Finding[] = []
          const reviewEvents: ReviewEvent[] = []

          send({ type: "start", recordsTotal: records.length, filesReviewed: files.length })

          if (transitionDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, transitionDelayMs))
          }

          const reviewStartedAt = performance.now()

          for (let index = 0; index < records.length; index += 8) {
            const batchRecords = records.slice(index, index + 8)
            const batch = await Promise.all(
              batchRecords.map((record) => reviewRecord(client, record)),
            )

            batch.forEach((outcome, batchIndex) => {
              const record = batchRecords[batchIndex]
              const event = {
                id: record.id,
                source: record.source,
                location: record.location,
                status: outcome.finding ? ("flagged" as const) : ("cleared" as const),
                riskScore: outcome.riskScore,
                preview: evidenceFrom(record.content),
                amount: record.amount,
                vendor: record.vendor,
                date: record.date,
              }

              reviewed.push(outcome)
              reviewEvents.push(event)
              if (outcome.finding) findings.push(outcome.finding)
              send({ type: "record", event, finding: outcome.finding })
            })
          }

          const reviewDurationMs = Math.max(1, Math.round(performance.now() - reviewStartedAt))
          findings.sort((a, b) => b.riskScore - a.riskScore)

          const result: AnalysisResult = {
            recordsReviewed: reviewed.length,
            filesReviewed: files.length,
            flaggedAmount: findings.reduce((sum, finding) => sum + (finding.amount ?? 0), 0),
            findings,
            reviewEvents,
            reviewDurationMs,
            model: "jev-latest",
          }

          send({ type: "complete", result })
        } catch (error) {
          send({
            type: "error",
            error: error instanceof Error ? error.message : "Analysis failed.",
          })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/x-ndjson; charset=utf-8",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed."
    return Response.json({ error: message }, { status: 500 })
  }
}
