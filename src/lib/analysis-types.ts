export type RiskLevel = "critical" | "high" | "medium"

export type RiskFactor = {
  label: string
  probability: number
}

export type Finding = {
  id: string
  title: string
  category: string
  riskLevel: RiskLevel
  riskScore: number
  confidence: number
  amount: number | null
  source: string
  location: string
  factors: RiskFactor[]
}

export type ReviewEvent = {
  id: string
  source: string
  location: string
  status: "cleared" | "flagged"
  riskScore: number
  preview: string
  amount: number | null
  vendor: string | null
  date: string | null
}

export type AnalysisResult = {
  recordsReviewed: number
  filesReviewed: number
  flaggedAmount: number
  findings: Finding[]
  reviewEvents: ReviewEvent[]
  reviewDurationMs: number
  model: string
}

export type AnalysisStreamMessage =
  | { type: "start"; recordsTotal: number; filesReviewed: number }
  | { type: "record"; event: ReviewEvent; finding: Finding | null }
  | { type: "complete"; result: AnalysisResult }
  | { type: "error"; error: string }
