export interface QuantBar {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume?: number
  source: string
  synthetic?: boolean
}

export type MarketRegime = "trending_up" | "trending_down" | "ranging" | "volatile"

export interface AlgorithmSignal {
  name: string
  score: number
  confidence: number
  description: string
  metadata?: Record<string, number>
}

export interface CompositeResult {
  compositeScore: number
  regime: MarketRegime
  confidence: number
  signals: AlgorithmSignal[]
  timestamp: Date
}

export interface DataSourceConfig {
  name: string
  priority: number
  enabled: boolean
  fetchFn: (symbol: string, days: number) => Promise<QuantBar[]>
}

export interface DataSourceStatus {
  name: string
  healthy: boolean
  lastLatencyMs: number
  successRate: number
  lastSuccessAt: string | null
  lastError: string | null
}

export const REGIME_WEIGHTS: Record<MarketRegime, Record<string, number>> = {
  trending_up: {
    maCrossover: 20,
    bollingerBands: 10,
    macd: 25,
    supportResistance: 10,
    volatility: 5,
    meanReversion: 5,
    momentum: 25,
  },
  trending_down: {
    maCrossover: 20,
    bollingerBands: 10,
    macd: 25,
    supportResistance: 10,
    volatility: 5,
    meanReversion: 5,
    momentum: 25,
  },
  ranging: {
    maCrossover: 5,
    bollingerBands: 25,
    macd: 10,
    supportResistance: 20,
    volatility: 5,
    meanReversion: 25,
    momentum: 10,
  },
  volatile: {
    maCrossover: 10,
    bollingerBands: 20,
    macd: 15,
    supportResistance: 10,
    volatility: 25,
    meanReversion: 10,
    momentum: 10,
  },
}
