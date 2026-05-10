import type { FxBar, StrategySignal, CompositeScoreResult, FxInterval } from "./fxTypes.js"
import type { MarketRegime } from "./types.js"
import { REGIME_WEIGHTS } from "./types.js"
import { detectRegime } from "./regimeDetector.js"
import { runAllStrategies } from "./strategy/index.js"
import { fxBarsToQuantBars } from "./strategy/utils.js"

const QUALITY_WEIGHT_MODIFIERS: Record<string, { syntheticPenalty: number }> = {
  bollingerBands: { syntheticPenalty: 0.3 },
  volatility: { syntheticPenalty: 0.3 },
  supportResistance: { syntheticPenalty: 0.4 },
  maCrossover: { syntheticPenalty: 0.8 },
  macd: { syntheticPenalty: 0.8 },
  momentum: { syntheticPenalty: 0.9 },
  meanReversion: { syntheticPenalty: 0.7 },
}

export function computeEnhancedCompositeScore(
  bars: FxBar[],
  options?: { interval?: FxInterval },
): CompositeScoreResult {
  const quantBars = fxBarsToQuantBars(bars)
  const regime = detectRegime(quantBars)

  const signals = runAllStrategies(bars, regime)

  const syntheticRatio = bars.filter((b) => b.isSynthetic).length / bars.length
  const overallQuality = bars.reduce((sum, b) => sum + b.qualityScore, 0) / bars.length

  const weights = REGIME_WEIGHTS[regime]
  let weightedSum = 0
  let totalWeight = 0

  for (const signal of signals) {
    const baseWeight = weights[signal.strategyKey] ?? 10
    const qualityMod = QUALITY_WEIGHT_MODIFIERS[signal.strategyKey]
    const qualityMultiplier = syntheticRatio > 0.5 && qualityMod
      ? qualityMod.syntheticPenalty
      : 1.0

    const effectiveWeight = baseWeight * qualityMultiplier * signal.dataQualityImpact
    weightedSum += signal.score * effectiveWeight
    totalWeight += effectiveWeight
  }

  const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0
  const confidence = computeEnhancedConfidence(signals, compositeScore, regime, overallQuality)

  const datasetVersion = buildDatasetVersion(bars)

  return {
    compositeScore: Math.round(compositeScore * 100) / 100,
    regime,
    confidence: Math.round(confidence * 1000) / 1000,
    signals,
    dataQuality: {
      overallScore: Math.round(overallQuality * 100) / 100,
      syntheticRatio: Math.round(syntheticRatio * 100) / 100,
    },
    datasetVersion,
    timestamp: new Date(),
  }
}

function computeEnhancedConfidence(
  signals: StrategySignal[],
  compositeScore: number,
  _regime: MarketRegime,
  dataQuality: number,
): number {
  if (signals.length === 0) return 0

  const direction = compositeScore > 0 ? 1 : compositeScore < 0 ? -1 : 0
  const agreeing = signals.filter((s) => {
    if (direction === 0) return Math.abs(s.score) < 10
    return Math.sign(s.score) === direction
  }).length

  const agreement = agreeing / signals.length
  const avgSignalConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length
  const scoreClarity = Math.min(1, Math.abs(compositeScore) / 50)
  const qualityFactor = Math.max(0.3, dataQuality)

  const rawConfidence = agreement * 0.35 + avgSignalConfidence * 0.25 + scoreClarity * 0.25 + qualityFactor * 0.15
  return Math.min(1, rawConfidence)
}

function buildDatasetVersion(bars: FxBar[]): string {
  if (bars.length === 0) return "empty"
  const source = bars[0].source
  const latest = bars[bars.length - 1].timestamp.toISOString().slice(0, 10)
  return `${source}_${bars.length}bars_${latest}`
}
