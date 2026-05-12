import axios from "axios"

const FINBERT_URL = process.env.FINBERT_SERVICE_URL ?? "http://localhost:5050"

export interface FinBertResult {
  text: string
  sentiment: "positive" | "negative" | "neutral"
  sentimentCn: string
  confidence: number
  scores: { positive: number; negative: number; neutral: number }
}

export interface FinBertSummary {
  total: number
  positive: number
  negative: number
  neutral: number
  dominant: "positive" | "negative" | "neutral"
  dominantCn: string
}

export interface FinBertAnalysis {
  results: FinBertResult[]
  summary: FinBertSummary
}

export async function analyzeWithFinBert(texts: string[]): Promise<FinBertAnalysis | null> {
  if (texts.length === 0) return null

  try {
    const res = await axios.post(
      `${FINBERT_URL}/analyze`,
      { texts },
      { timeout: 30000 },
    )
    return res.data as FinBertAnalysis
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes("ECONNREFUSED")) {
      return null
    }
    throw new Error(`FinBERT 分析失败: ${msg}`)
  }
}

export async function isFinBertAvailable(): Promise<boolean> {
  try {
    const res = await axios.get(`${FINBERT_URL}/health`, { timeout: 3000 })
    return res.data?.status === "ok"
  } catch {
    return false
  }
}
