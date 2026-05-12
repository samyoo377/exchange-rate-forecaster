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
  [key: string]: any
}

export interface IndicatorValues {
  close?: number
  rsi14?: number
  stochK?: number
  stochD?: number
  cci20?: number
  adx14?: number
  plusDi14?: number
  minusDi14?: number
  ao?: number
  mom10?: number
  macd?: number
  macdSignal?: number
  macdHist?: number
  stochRsiK?: number
  stochRsiD?: number
  williamsR?: number
  bullPower?: number
  bearPower?: number
  uo?: number
  ema10?: number
  ema20?: number
  ema30?: number
  ema50?: number
  ema100?: number
  ema200?: number
  sma10?: number
  sma20?: number
  sma30?: number
  sma50?: number
  sma100?: number
  sma200?: number
  vwma?: number
  hma?: number
  ichTenkan?: number
  ichKijun?: number
  ichSenkouA?: number
  ichSenkouB?: number
  pivotPP?: number
  pivotR1?: number
  pivotR2?: number
  pivotR3?: number
  pivotS1?: number
  pivotS2?: number
  pivotS3?: number
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
