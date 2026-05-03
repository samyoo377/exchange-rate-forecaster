import { z } from "zod"

export const refreshRequestSchema = z.object({
  symbol: z.string().min(3).default("USDCNH"),
  source: z.enum(["alpha_vantage", "excel"]).default("excel")
})

export const predictionQuerySchema = z.object({
  symbol: z.string().min(3).default("USDCNH"),
  question: z.string().min(2),
  horizon: z.string().min(1).default("3D")
})

export const importFileSchema = z.object({
  filePath: z.string().min(1)
})

export interface PredictionResult {
  symbol: string
  horizon: string
  direction: "bullish" | "bearish" | "neutral"
  confidence: number
  rationale: string[]
  riskNotes: string[]
  sourceRefs: string[]
  generatedAt: string
  snapshotVersion: string
}

export interface InsightSummary {
  symbol: string
  title: string
  summary: string
  drivers: string[]
  tags: string[]
  sourceRefs: string[]
  generatedAt: string
}
