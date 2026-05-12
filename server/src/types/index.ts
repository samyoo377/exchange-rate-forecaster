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

export interface SignalResult {
  rsi: "buy" | "sell" | "neutral"
  stoch: "buy" | "sell" | "neutral"
  cci: "buy" | "sell" | "neutral"
  ao: "buy" | "sell" | "neutral"
  mom: "buy" | "sell" | "neutral"
  pivotPP?: "buy" | "sell" | "neutral"
  pivotR1?: "buy" | "sell" | "neutral"
  pivotR2?: "buy" | "sell" | "neutral"
  pivotR3?: "buy" | "sell" | "neutral"
  pivotS1?: "buy" | "sell" | "neutral"
  pivotS2?: "buy" | "sell" | "neutral"
  pivotS3?: "buy" | "sell" | "neutral"
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
