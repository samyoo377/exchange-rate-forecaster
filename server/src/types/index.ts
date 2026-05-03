export interface OhlcBar {
  symbol: string
  tradeDate: Date
  open: number
  high: number
  low: number
  close: number
  volume?: number
  source: string
  version: string
}

export interface IndicatorValues {
  rsi14?: number
  stochK?: number
  stochD?: number
  cci20?: number
  adx14?: number
  plusDi14?: number
  minusDi14?: number
  ao?: number
  mom10?: number
}

export interface SignalResult {
  rsi: "buy" | "sell" | "neutral"
  stoch: "buy" | "sell" | "neutral"
  cci: "buy" | "sell" | "neutral"
  ao: "buy" | "sell" | "neutral"
  mom: "buy" | "sell" | "neutral"
}

export interface PredictionOutput {
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

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T | null
  requestId?: string
}

export interface PaginatedResult<T> {
  list: T[]
  page: number
  pageSize: number
  total: number
}
