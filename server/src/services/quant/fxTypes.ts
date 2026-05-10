import type { MarketRegime } from "./types.js"

export type FxInterval = "1h" | "4h" | "1d"
export type BasisRiskLevel = "low" | "medium" | "high"
export type SignalDirection = "bullish" | "bearish" | "neutral"

export interface HistoryRequest {
  symbol: string
  interval: FxInterval
  start?: Date
  end?: Date
  limit?: number
  preferredSources?: string[]
  allowSynthetic?: boolean
  minQualityScore?: number
}

export interface FxBar {
  symbol: string
  interval: FxInterval
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume?: number
  source: string
  isSynthetic: boolean
  qualityScore: number
  version: string
  canonicalSymbol?: string
  sourceSymbol?: string
  proxyFor?: string
  basisRiskLevel?: BasisRiskLevel
}

export interface FxDataSourceAdapter {
  name: string
  priority: number
  supports(symbol: string): boolean
  queryHistory(request: HistoryRequest): Promise<FxBar[]>
}

export interface StrategyContext {
  bars: FxBar[]
  regime: MarketRegime
  symbol: string
  interval: FxInterval
}

export interface StrategySignal {
  strategyKey: string
  strategyVersion: string
  score: number
  confidence: number
  direction: SignalDirection
  rationale: string[]
  evidence: Record<string, number | string>
  dataQualityImpact: number
}

export interface QuantStrategy {
  key: string
  displayName: string
  version: string
  supportedIntervals: FxInterval[]
  supportsSynthetic: boolean
  supportedRegimes?: MarketRegime[]
  evaluate(context: StrategyContext): StrategySignal
}

export interface QuantBundle {
  symbol: string
  horizon: string
  latestBar: FxBar
  regime: MarketRegime
  compositeScore: number
  confidence: number
  topSignals: StrategySignal[]
  dataQuality: {
    overallScore: number
    syntheticRatio: number
  }
  datasetVersion: string
  timestamp: Date
}

export interface CompositeScoreResult {
  compositeScore: number
  regime: MarketRegime
  confidence: number
  signals: StrategySignal[]
  dataQuality: {
    overallScore: number
    syntheticRatio: number
  }
  datasetVersion: string
  timestamp: Date
}
