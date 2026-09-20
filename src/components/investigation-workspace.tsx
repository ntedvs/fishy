"use client"

import {
  CheckCircleIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  ShieldCheckIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react"
import { CSSProperties, ChangeEvent, DragEvent, useRef, useState } from "react"

import DatamoshTransition from "~/components/datamosh-transition"
import { AnalysisResult, AnalysisStreamMessage, Finding, ReviewEvent } from "~/lib/analysis-types"

const acceptedExtensions = ["csv", "xlsx", "xls", "pdf", "docx", "json", "txt"]

const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-burgundy/30"
function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function ImportPanel({
  files,
  error,
  onAdd,
  onRemove,
  onAnalyze,
}: {
  files: File[]
  error: string | null
  onAdd: (files: File[]) => void
  onRemove: (key: string) => void
  onAnalyze: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onAdd(Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    onAdd(Array.from(event.dataTransfer.files))
  }

  return (
    <main className="mx-auto w-[min(900px,calc(100%-48px))] pt-[clamp(56px,8vh,92px)] pb-20 max-sm:w-[calc(100%-28px)] max-sm:pt-12">
      <section className="mb-8 max-w-[680px]">
        <h1 className="m-0 text-[clamp(36px,4.7vw,56px)] leading-[1] font-medium tracking-[-0.05em] text-ink max-sm:text-[38px]">
          Find the transactions that deserve a closer look.
        </h1>
        <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-muted">
          Upload financial records. Fishy checks every record and surfaces the strongest risk
          signals.
        </p>
      </section>

      <section
        className="overflow-hidden rounded-xl border border-line-strong bg-paper shadow-[0_12px_36px_rgba(79,34,44,0.06)]"
        aria-label="Import files"
      >
        <div
          className={`flex min-h-[270px] flex-col items-center justify-center border-b border-line bg-white p-10 transition-[background-color,box-shadow] max-sm:min-h-[250px] max-sm:p-5 max-sm:text-center ${dragging ? "bg-burgundy-soft shadow-[inset_0_0_0_2px_#4F222C]" : ""}`}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <h2 className="m-0 text-base font-semibold tracking-[-0.02em]">
            Drop financial records here
          </h2>
          <button
            className={`mt-4 min-h-9 cursor-pointer rounded-md border border-line-strong bg-paper px-3.5 text-[13px] font-semibold text-ink shadow-[0_1px_2px_rgba(79,34,44,0.04)] ${focusRing}`}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            Choose files
          </button>
          <input
            accept=".csv,.xlsx,.xls,.pdf,.docx,.json,.txt"
            className="sr-only"
            multiple
            onChange={handleChange}
            ref={inputRef}
            type="file"
          />
        </div>

        {files.length > 0 && (
          <div className="border-b border-line">
            {files.map((file) => (
              <div
                className="grid min-h-[54px] grid-cols-[26px_minmax(0,1fr)_auto_28px] items-center gap-3 border-b border-line px-5 text-[13px] last:border-b-0"
                key={fileKey(file)}
              >
                <span className="text-burgundy">
                  <FileTextIcon aria-hidden size={20} />
                </span>
                <span className="overflow-hidden font-medium text-ellipsis whitespace-nowrap">
                  {file.name}
                </span>
                <span className="font-mono text-[11px] text-muted">{formatBytes(file.size)}</span>
                <button
                  aria-label={`Remove ${file.name}`}
                  className={`grid size-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 text-muted hover:bg-canvas hover:text-ink ${focusRing}`}
                  onClick={() => onRemove(fileKey(file))}
                  type="button"
                >
                  <TrashIcon aria-hidden size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="m-0 border-b border-[#efbeb5] bg-risk-soft px-5 py-3 text-[13px] text-[#9c3828]">
            {error}
          </p>
        )}

        <div className="flex min-h-[76px] items-center justify-between px-5 py-3.5 max-sm:flex-col max-sm:items-stretch max-sm:gap-3">
          {files.length > 0 && (
            <p className="m-0 text-[13px] text-muted max-sm:text-center">
              {files.length} file{files.length === 1 ? "" : "s"} ready
            </p>
          )}
          <button
            className={`ml-auto min-h-10 cursor-pointer rounded-lg border border-ink bg-ink px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35 max-sm:ml-0 ${focusRing}`}
            disabled={!files.length}
            onClick={onAnalyze}
            type="button"
          >
            Analyze records
          </button>
        </div>
      </section>
    </main>
  )
}

type ChunkState = "processing" | "clear" | "suspicious" | "fraud"
type AnalysisPhase = "covered" | "revealing" | "analyzing"
type ReviewDecision = {
  status: "confirmed" | "safe"
  note: string
}

const phaseCopy: Record<Exclude<AnalysisPhase, "analyzing">, { title: string; detail: string }> = {
  covered: {
    title: "Reading your documents",
    detail: "Finding the records and supporting details inside each file.",
  },
  revealing: {
    title: "Building the review grid",
    detail: "Giving each chunk a place before analysis begins.",
  },
}

function getChunkState(event: ReviewEvent | undefined): ChunkState {
  if (!event) return "processing"
  if (event.status === "cleared") return "clear"
  return event.riskScore >= 0.78 ? "fraud" : "suspicious"
}

const chunkColors: Record<ChunkState, string> = {
  processing: "border-line-strong bg-paper/45",
  clear: "border-[#15803D] bg-[#22C55E] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]",
  suspicious: "border-[#B45309] bg-[#F59E0B] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]",
  fraud: "border-[#B91C1C] bg-[#EF4444] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]",
}

const stateLabels: Record<ChunkState, string> = {
  processing: "Processing",
  clear: "Clear",
  suspicious: "Suspicious",
  fraud: "Fraud risk",
}

const stateTextColors: Record<ChunkState, string> = {
  processing: "text-muted",
  clear: "text-[#15803D]",
  suspicious: "text-[#A14E08]",
  fraud: "text-[#B91C1C]",
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatCompactCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: amount >= 1_000 ? 1 : 0,
  }).format(amount)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function EvidenceTrace({ event }: { event: ReviewEvent }) {
  const terms = [
    event.vendor,
    event.date,
    event.amount === null ? null : event.amount.toFixed(2),
    event.amount === null
      ? null
      : event.amount.toLocaleString("en-US", { maximumFractionDigits: 2 }),
  ]
    .filter((term): term is string => Boolean(term))
    .sort((a, b) => b.length - a.length)
  const pattern = terms.length ? new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi") : null
  const parts = pattern ? event.preview.split(pattern) : [event.preview]

  return (
    <blockquote className="m-0 rounded-lg border border-line bg-canvas/70 px-4 py-3 font-mono text-[11px] leading-[1.75] text-ink">
      {parts.map((part, index) =>
        terms.some((term) => term.toLowerCase() === part.toLowerCase()) ? (
          <mark className="rounded-[3px] bg-[#ead2a8] px-0.5 text-ink" key={`${part}-${index}`}>
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </blockquote>
  )
}

function ChunkInspector({
  decision,
  event,
  finding,
  index,
  onClose,
  onDecide,
}: {
  decision: ReviewDecision | undefined
  event: ReviewEvent
  finding: Finding | undefined
  index: number
  onClose: () => void
  onDecide: (decision: ReviewDecision) => void
}) {
  const state = getChunkState(event)
  const [note, setNote] = useState(decision?.note ?? "")
  const details = [
    event.vendor ? { label: "Vendor", value: event.vendor } : null,
    event.amount !== null ? { label: "Amount", value: formatCurrency(event.amount) } : null,
    event.date ? { label: "Date", value: event.date } : null,
  ].filter((detail): detail is { label: string; value: string } => detail !== null)

  return (
    <aside
      aria-label={`Details for chunk ${index + 1}`}
      className="sticky top-6 max-h-[calc(100vh-118px)] self-start overflow-y-auto rounded-xl border border-line-strong bg-paper shadow-[0_12px_36px_rgba(79,34,44,0.08)] max-md:fixed max-md:inset-x-3 max-md:bottom-3 max-md:top-auto max-md:z-20 max-md:max-h-[72vh]"
      id="chunk-inspector"
    >
      <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-line bg-paper/95 px-5 py-4 backdrop-blur-sm">
        <div>
          <p className="m-0 font-mono text-[11px] text-muted">Chunk {index + 1}</p>
          <h2 className="mt-1 mb-0 text-lg leading-tight font-semibold tracking-[-0.025em] text-ink">
            {finding?.title ?? "No clear risk found"}
          </h2>
        </div>
        <button
          aria-label="Close chunk details"
          className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 text-muted hover:bg-canvas hover:text-ink ${focusRing}`}
          onClick={onClose}
          type="button"
        >
          <XIcon aria-hidden size={17} />
        </button>
      </div>

      <div className="space-y-6 p-5">
        <div className="flex items-center justify-between gap-4">
          <span className={`text-sm font-semibold ${stateTextColors[state]}`}>
            {stateLabels[state]}
          </span>
          <span className="font-mono text-sm font-medium text-ink">
            {Math.round(event.riskScore * 100)}% risk score
          </span>
        </div>

        <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-line py-4">
          <div className="col-span-2">
            <dt className="text-[11px] text-muted">Source</dt>
            <dd className="mt-1 mb-0 break-words text-sm font-medium text-ink">{event.source}</dd>
          </div>
          {details.map((detail) => (
            <div key={detail.label}>
              <dt className="text-[11px] text-muted">{detail.label}</dt>
              <dd className="mt-1 mb-0 break-words text-sm text-ink">{detail.value}</dd>
            </div>
          ))}
        </dl>

        <section className="pt-2">
          <div className="flex items-end justify-between gap-4">
            <h3 className="m-0 text-[12px] font-semibold text-ink">Evidence reviewed</h3>
            <span className="font-mono text-[10px] text-muted">Exact source text</span>
          </div>
          <p className="mt-1.5 mb-3 text-[11px] leading-relaxed text-muted">
            Highlighted values were extracted from this source and used in the assessment.
          </p>
          {event.preview ? (
            <EvidenceTrace event={event} />
          ) : (
            <p className="m-0 text-[13px] text-muted">No source text is available.</p>
          )}
        </section>

        {finding && (
          <section>
            <div className="flex items-center justify-between gap-4">
              <h3 className="m-0 text-[12px] font-semibold text-ink">Risk signals</h3>
              <span className="font-mono text-[11px] text-muted">
                {Math.round(finding.confidence * 100)}% confidence
              </span>
            </div>
            {finding.factors.length > 0 && (
              <ul className="mt-2 mb-0 space-y-2 p-0">
                {finding.factors.map((factor) => (
                  <li
                    className="flex items-start justify-between gap-4 text-[13px] text-muted"
                    key={factor.label}
                  >
                    <span>{factor.label}</span>
                    <span className="shrink-0 font-mono text-[11px] text-ink">
                      {Math.round(factor.probability * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {finding && (
          <section className="border-t border-line pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="m-0 text-[12px] font-semibold text-ink">Reviewer decision</h3>
              {decision && (
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${decision.status === "confirmed" ? "text-[#a33829]" : "text-clear"}`}
                >
                  {decision.status === "confirmed" ? (
                    <WarningCircleIcon aria-hidden size={14} weight="fill" />
                  ) : (
                    <CheckCircleIcon aria-hidden size={14} weight="fill" />
                  )}
                  {decision.status === "confirmed" ? "Concern confirmed" : "Marked safe"}
                </span>
              )}
            </div>
            <label
              className="mt-3 block text-[11px] text-muted"
              htmlFor={`review-note-${event.id}`}
            >
              Review note <span className="text-muted/70">(optional)</span>
            </label>
            <textarea
              className={`mt-1.5 min-h-20 w-full resize-y rounded-lg border border-line-strong bg-white px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-muted/55 ${focusRing}`}
              id={`review-note-${event.id}`}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Record what you checked or what should happen next."
              value={note}
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-burgundy bg-burgundy px-3 text-[12px] font-semibold text-white ${focusRing}`}
                onClick={() => onDecide({ status: "confirmed", note: note.trim() })}
                type="button"
              >
                <WarningCircleIcon aria-hidden size={16} />
                Confirm concern
              </button>
              <button
                className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#9fc9b0] bg-clear-soft px-3 text-[12px] font-semibold text-clear ${focusRing}`}
                onClick={() => onDecide({ status: "safe", note: note.trim() })}
                type="button"
              >
                <ShieldCheckIcon aria-hidden size={16} />
                Mark safe
              </button>
            </div>
          </section>
        )}
      </div>
    </aside>
  )
}

function EmptyChunkInspector({ hidden }: { hidden: boolean }) {
  return (
    <aside
      aria-hidden={hidden}
      className={`sticky top-6 min-h-[280px] self-start rounded-xl border border-line bg-paper/45 p-6 max-md:hidden ${hidden ? "invisible" : ""}`}
      id="chunk-inspector"
    >
      <div className="grid size-10 place-items-center rounded-lg border border-line bg-paper text-muted">
        <FileTextIcon aria-hidden size={19} weight="duotone" />
      </div>
      <h2 className="mt-5 mb-0 text-base font-semibold tracking-[-0.02em] text-muted">
        No chunk selected
      </h2>
      <p className="mt-2 mb-0 max-w-[260px] text-[13px] leading-relaxed text-muted/75">
        Select a reviewed chunk to inspect its source, risk score, and signals.
      </p>
    </aside>
  )
}

const categoryNames: Record<string, string> = {
  duplicate_or_reused: "duplicate or reused payments",
  threshold_avoidance: "possible approval avoidance",
  vendor_mismatch: "vendor and purpose mismatches",
  weak_documentation: "weak supporting documentation",
  unusual_payment: "unusual payment patterns",
}

const categoryActions: Record<string, string> = {
  duplicate_or_reused: "Match repeated amounts against invoice numbers and payment references.",
  threshold_avoidance: "Compare nearby payments with approval thresholds and authorization logs.",
  vendor_mismatch:
    "Validate flagged vendors against contracts, purchase orders, and stated purpose.",
  weak_documentation: "Request receipts, business purpose, and approver support for weak records.",
  unusual_payment: "Reconcile unusual payments with the ledger and confirm the recipient account.",
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function InvestigationBrief({
  decisions,
  events,
  findings,
}: {
  decisions: Record<string, ReviewDecision>
  events: ReviewEvent[]
  findings: Finding[]
}) {
  const categoryCounts = new Map<string, number>()
  const sourceCounts = new Map<string, number>()

  findings.forEach((finding) => {
    categoryCounts.set(finding.category, (categoryCounts.get(finding.category) ?? 0) + 1)
    sourceCounts.set(finding.source, (sourceCounts.get(finding.source) ?? 0) + 1)
  })

  const rankedCategories = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1])
  const topCategory = rankedCategories[0]
  const topSource = Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1])[0]
  const criticalCount = findings.filter((finding) => finding.riskLevel === "critical").length
  const flaggedRate = events.length > 0 ? findings.length / events.length : 0
  const flaggedExposure = findings.reduce((sum, finding) => sum + (finding.amount ?? 0), 0)
  const assessment =
    findings.length === 0
      ? "No concentrated risk pattern detected"
      : criticalCount > 0 || flaggedRate >= 0.25
        ? "Elevated risk concentration"
        : "Targeted exceptions merit review"
  const assessmentTone =
    findings.length === 0
      ? "border-[#b8d8c6] bg-clear-soft text-clear"
      : criticalCount > 0 || flaggedRate >= 0.25
        ? "border-[#efbeb5] bg-[#f8e3df] text-[#a33829]"
        : "border-[#e5c99d] bg-[#f8eedf] text-[#8a551e]"
  const actions = rankedCategories
    .map(([category]) => categoryActions[category])
    .filter((action): action is string => Boolean(action))

  if (actions.length < 3) {
    actions.push(
      "Trace the highest-risk chunks back to their source records and named approvers.",
      "Preserve the supporting files and record the outcome of each manual check.",
      "Sample cleared records to confirm the screening thresholds match your review policy.",
    )
  }

  const confirmedCount = Object.values(decisions).filter(
    (decision) => decision.status === "confirmed",
  ).length
  const safeCount = Object.values(decisions).filter((decision) => decision.status === "safe").length
  const pendingCount = Math.max(0, findings.length - confirmedCount - safeCount)

  function exportReport() {
    const headers = [
      "Records reviewed",
      "Flagged records",
      "Flagged amount",
      "Confirmed concerns",
      "Marked safe",
      "Pending review",
      "Finding",
      "Risk level",
      "Risk score",
      "Confidence",
      "Amount",
      "Source",
      "Location",
      "Evidence",
      "Risk signals",
      "Reviewer decision",
      "Reviewer note",
      "Recommended next step",
    ]
    const rows = findings.length
      ? findings.map((finding) => {
          const event = events.find((event) => event.id === finding.id)
          const decision = decisions[finding.id]
          return [
            events.length,
            findings.length,
            flaggedExposure.toFixed(2),
            confirmedCount,
            safeCount,
            pendingCount,
            finding.title,
            finding.riskLevel,
            Math.round(finding.riskScore * 100),
            Math.round(finding.confidence * 100),
            finding.amount?.toFixed(2) ?? "",
            finding.source,
            finding.location,
            event?.preview ?? "",
            finding.factors.map((factor) => factor.label).join("; "),
            decision?.status ?? "pending",
            decision?.note ?? "",
            categoryActions[finding.category] ?? actions[0],
          ]
        })
      : [
          [
            events.length,
            0,
            "0.00",
            0,
            0,
            0,
            "No findings",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            actions[0],
          ],
        ]
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `fishy-investigation-report-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="mt-10 overflow-hidden rounded-xl border border-line-strong bg-paper shadow-[0_12px_36px_rgba(79,34,44,0.05)]">
      <header className="flex items-center justify-between gap-5 px-6 py-5 max-sm:items-start max-sm:px-5">
        <div>
          <h2 className="m-0 text-xl font-semibold tracking-[-0.035em] text-ink">
            Investigation brief
          </h2>
          <p className="mt-1.5 mb-0 text-[13px] text-muted">
            A portfolio-level reading of the completed review.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 max-sm:flex-col max-sm:items-end">
          <span
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold max-sm:max-w-[130px] max-sm:text-center ${assessmentTone}`}
          >
            {assessment}
          </span>
          <button
            className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-white px-3 text-[11px] font-semibold text-ink ${focusRing}`}
            onClick={exportReport}
            type="button"
          >
            <DownloadSimpleIcon aria-hidden size={14} />
            Export report
          </button>
        </div>
      </header>

      <div className="border-t border-line">
        <div className="p-6 max-sm:p-5">
          <h3 className="m-0 text-sm font-semibold text-ink">What the evidence suggests</h3>
          <p className="mt-3 mb-0 text-[14px] leading-relaxed text-muted">
            {findings.length === 0
              ? `All ${events.length.toLocaleString()} reviewed chunks cleared the current screening thresholds. No specific fraud pattern stands out in this pass.`
              : `${findings.length.toLocaleString()} of ${events.length.toLocaleString()} chunks were flagged (${Math.round(flaggedRate * 100)}%).${flaggedExposure > 0 ? ` They represent ${formatCompactCurrency(flaggedExposure)} in identified exposure.` : ""}`}
          </p>

          {findings.length > 0 && (
            <dl className="mt-5 mb-0 space-y-4 border-t border-line pt-5">
              <div>
                <dt className="text-[11px] text-muted">Dominant pattern</dt>
                <dd className="mt-1 mb-0 text-sm font-medium text-ink">
                  {topCategory
                    ? `${topCategory[1]} finding${topCategory[1] === 1 ? "" : "s"} involve ${categoryNames[topCategory[0]] ?? "the same risk pattern"}.`
                    : "No dominant pattern."}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">Concentration</dt>
                <dd className="mt-1 mb-0 text-sm font-medium text-ink">
                  {topSource && topSource[1] > 1
                    ? `${topSource[0]} contains ${topSource[1]} flagged chunks.`
                    : `Flags span ${sourceCounts.size} source document${sourceCounts.size === 1 ? "" : "s"}.`}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      {findings.length > 0 && (
        <dl className="m-0 grid grid-cols-3 border-t border-line bg-canvas/45 max-sm:grid-cols-1">
          {[
            { label: "Confirmed concerns", value: confirmedCount, tone: "text-[#a33829]" },
            { label: "Marked safe", value: safeCount, tone: "text-clear" },
            { label: "Awaiting review", value: pendingCount, tone: "text-ink" },
          ].map((item) => (
            <div
              className="flex items-baseline justify-between border-r border-line px-6 py-4 last:border-r-0 max-sm:border-r-0 max-sm:border-b max-sm:last:border-b-0"
              key={item.label}
            >
              <dt className="text-[12px] text-muted">{item.label}</dt>
              <dd className={`m-0 font-mono text-lg font-semibold ${item.tone}`}>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function ChunkGrid({
  analyzing,
  events,
  findings,
  phase,
  recordsTotal,
}: {
  analyzing: boolean
  events: ReviewEvent[]
  findings: Finding[]
  phase: AnalysisPhase
  recordsTotal: number
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({})
  const total = Math.max(recordsTotal, events.length)
  const preparing = analyzing && phase !== "analyzing"
  const preparationCopy = phase === "analyzing" ? null : phaseCopy[phase]
  const selectedIndex = events.findIndex((event) => event.id === selectedId)
  const selectedEvent = selectedIndex >= 0 ? events[selectedIndex] : undefined
  const selectedFinding = selectedEvent
    ? findings.find((finding) => finding.id === selectedEvent.id)
    : undefined
  const counts = events.reduce(
    (current, event) => {
      const state = getChunkState(event)
      if (state !== "processing") current[state] += 1
      return current
    },
    { clear: 0, suspicious: 0, fraud: 0 },
  )
  const valueReviewed = events.reduce((sum, event) => sum + (event.amount ?? 0), 0)
  const statistics = [
    { label: "Value reviewed", value: formatCompactCurrency(valueReviewed), color: "bg-ink" },
    { label: "Clear", value: counts.clear.toLocaleString(), color: "bg-[#22C55E]" },
    {
      label: "Suspicious",
      value: counts.suspicious.toLocaleString(),
      color: "bg-[#F59E0B]",
    },
    { label: "Fraud", value: counts.fraud.toLocaleString(), color: "bg-[#EF4444]" },
  ]

  return (
    <>
      {preparing && <DatamoshTransition revealing={phase === "revealing"} />}
      <main
        aria-label="Document chunk analysis"
        aria-live="polite"
        className="min-h-[calc(100vh-70px)] p-8 max-sm:min-h-[calc(100vh-62px)] max-sm:p-4"
      >
        <header className="mb-8 flex items-end justify-between gap-10 border-b border-line pb-6 max-md:flex-col max-md:items-start max-md:gap-6">
          <div>
            <h1 className="m-0 text-[clamp(28px,3vw,42px)] leading-none font-medium tracking-[-0.045em] text-ink">
              {preparing
                ? preparationCopy?.title
                : analyzing
                  ? "Reviewing document chunks"
                  : "Analysis complete"}
            </h1>
            <p className="mt-3 mb-0 text-sm text-muted">
              {preparing
                ? preparationCopy?.detail
                : total > 0
                  ? `${events.length.toLocaleString()} of ${total.toLocaleString()} chunks reviewed`
                  : "Preparing document chunks…"}
            </p>
          </div>

          <dl
            className={`m-0 flex shrink-0 gap-9 max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:gap-x-8 max-sm:gap-y-5 ${preparing ? "invisible" : ""}`}
          >
            {statistics.map((statistic) => (
              <div className="flex min-w-[72px] flex-col gap-1.5" key={statistic.label}>
                <dt className="flex items-center gap-2 text-[11px] text-muted">
                  <span className={`size-2 rounded-[2px] ${statistic.color}`} />
                  {statistic.label}
                </dt>
                <dd className="m-0 font-mono text-2xl leading-none font-medium tracking-[-0.05em] text-ink">
                  {statistic.value}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        <div
          className={`analysis-stage analysis-stage-${phase} relative grid min-h-[210px] grid-cols-[minmax(0,1fr)_420px] items-start gap-8 max-lg:grid-cols-[minmax(0,1fr)_380px] max-md:grid-cols-1`}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap content-start gap-2 max-sm:gap-1.5">
              {Array.from({ length: total }, (_, index) => {
                const event = events[index]
                const state = getChunkState(event)
                const label = event
                  ? `${event.source}, ${event.location}: ${stateLabels[state]}`
                  : `Chunk ${index + 1}: processing`
                const animationStyle = {
                  "--chunk-delay": `${Math.min(index * 12, 720)}ms`,
                } as CSSProperties

                return event ? (
                  <button
                    aria-controls="chunk-inspector"
                    aria-expanded={selectedId === event.id}
                    aria-label={`Open ${label}`}
                    className={`chunk-cell-resolved relative size-9 shrink-0 cursor-pointer rounded-lg border p-0 hover:brightness-95 ${chunkColors[state]} ${focusRing} max-sm:size-7 max-sm:rounded-md`}
                    key={index}
                    onClick={() => setSelectedId(event.id)}
                    title={label}
                    type="button"
                  >
                    {decisions[event.id] && (
                      <span
                        aria-hidden
                        className={`absolute -right-1 -bottom-1 size-2.5 rounded-full border-2 border-canvas ${decisions[event.id].status === "confirmed" ? "bg-[#8f3023]" : "bg-clear"}`}
                      />
                    )}
                  </button>
                ) : (
                  <span
                    aria-label={label}
                    className={`relative size-9 shrink-0 rounded-lg border ${chunkColors[state]} ${preparing ? "chunk-transfer" : "chunk-cell-pending"} max-sm:size-7 max-sm:rounded-md`}
                    key={index}
                    style={animationStyle}
                    title={label}
                  />
                )
              })}
            </div>

            {!analyzing && events.length > 0 && (
              <InvestigationBrief decisions={decisions} events={events} findings={findings} />
            )}
          </div>

          {selectedEvent ? (
            <ChunkInspector
              decision={decisions[selectedEvent.id]}
              event={selectedEvent}
              finding={selectedFinding}
              index={selectedIndex}
              key={selectedEvent.id}
              onClose={() => setSelectedId(null)}
              onDecide={(decision) =>
                setDecisions((current) => ({ ...current, [selectedEvent.id]: decision }))
              }
            />
          ) : (
            <EmptyChunkInspector hidden={preparing} />
          )}
        </div>
      </main>
    </>
  )
}

export default function InvestigationWorkspace() {
  const [files, setFiles] = useState<File[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [phase, setPhase] = useState<AnalysisPhase>("covered")
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [liveEvents, setLiveEvents] = useState<ReviewEvent[]>([])
  const [recordsTotal, setRecordsTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function addFiles(incoming: File[]) {
    setError(null)
    setFiles((current) => {
      const existing = new Set(current.map(fileKey))
      const valid = incoming.filter((file) => {
        const extension = file.name.split(".").pop()?.toLowerCase()
        return extension && acceptedExtensions.includes(extension) && !existing.has(fileKey(file))
      })
      return [...current, ...valid].slice(0, 12)
    })
  }

  async function analyze() {
    setAnalyzing(true)
    setPhase("covered")
    setError(null)
    setResult(null)
    setLiveEvents([])
    setRecordsTotal(0)
    const formData = new FormData()
    files.forEach((file) => formData.append("files", file))
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const transitionStartedAt = performance.now()
    formData.append("transitionDelayMs", reduceMotion ? "0" : "3000")

    try {
      const response = await fetch("/api/analyze", { method: "POST", body: formData })
      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error ?? "Analysis failed.")
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("Analysis stream could not be opened.")

      const decoder = new TextDecoder()
      let buffer = ""
      let completed = false

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line) continue
          const message = JSON.parse(line) as AnalysisStreamMessage

          if (message.type === "start") {
            setRecordsTotal(message.recordsTotal)
            if (reduceMotion) {
              setPhase("analyzing")
            } else {
              const minimumHold = Math.max(0, 1350 - (performance.now() - transitionStartedAt))
              await new Promise((resolve) => window.setTimeout(resolve, minimumHold))
              setPhase("revealing")
              await new Promise((resolve) => window.setTimeout(resolve, 1700))
              setPhase("analyzing")
            }
          }
          if (message.type === "record") {
            setLiveEvents((current) => [...current, message.event])
            if (!reduceMotion) {
              await new Promise((resolve) => window.setTimeout(resolve, 45))
            }
          }
          if (message.type === "complete") {
            const analysis = message.result
            completed = true
            setResult(analysis)
            setLiveEvents(analysis.reviewEvents)
          }
          if (message.type === "error") throw new Error(message.error)
        }

        if (done) break
      }

      if (!completed) throw new Error("Analysis ended before results were ready.")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.")
      setResult(null)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-70px)] max-sm:min-h-[calc(100vh-62px)]">
      {(analyzing || result) && (
        <ChunkGrid
          analyzing={analyzing}
          events={result?.reviewEvents ?? liveEvents}
          findings={result?.findings ?? []}
          phase={phase}
          recordsTotal={recordsTotal}
        />
      )}
      {!analyzing && !result && (
        <ImportPanel
          error={error}
          files={files}
          onAdd={addFiles}
          onAnalyze={analyze}
          onRemove={(key) => setFiles((current) => current.filter((file) => fileKey(file) !== key))}
        />
      )}
    </div>
  )
}
