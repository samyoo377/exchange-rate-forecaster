export interface OhlcBar {
  tradeDate: string
  open: number
  high: number
  low: number
  close: number
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

export interface LatestPredictionSummary {
  direction: "bullish" | "bearish" | "neutral"
  confidence: number
  horizon: string
}

export interface DashboardData {
  symbol: string
  lastUpdatedAt: string
  series: OhlcBar[]
  indicators: IndicatorValues
  latestPrediction: LatestPredictionSummary | null
}

export interface PredictionResult {
  id: string
  symbol: string
  horizon: string
  direction: "bullish" | "bearish" | "neutral"
  confidence: number
  rationale: string[]
  riskNotes: string[]
  userQuery: string
  modelVersion: string
  createdAt: string
}

export interface TaskLog {
  id: string
  taskType: string
  status: string
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
  createdAt: string
}

export interface PaginatedResult<T> {
  list: T[]
  page: number
  pageSize: number
  total: number
}

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T | null
}
