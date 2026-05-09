import type { QuantBar, AlgorithmSignal, CompositeResult, MarketRegime } from "./types.js"
import { REGIME_WEIGHTS } from "./types.js"
import { detectRegime } from "./regimeDetector.js"
import { computeMaCrossover } from "./algorithms/maCrossover.js"
import { computeBollingerBands } from "./algorithms/bollingerBands.js"
import { computeMacd } from "./algorithms/macd.js"
import { computeSupportResistance } from "./algorithms/supportResistance.js"
import { computeVolatilityRegime } from "./algorithms/volatilityRegime.js"
import { computeMeanReversion } from "./algorithms/meanReversion.js"
import { computeMomentum } from "./algorithms/momentum.js"

export function computeCompositeScore(bars: QuantBar[]): CompositeResult {
  const regime = detectRegime(bars)

  const signals: AlgorithmSignal[] = [
    computeMaCrossover(bars),
    computeBollingerBands(bars),
    computeMacd(bars),
    computeSupportResistance(bars),
    computeVolatilityRegime(bars),
    computeMeanReversion(bars),
    computeMomentum(bars),
  ]

  const weights = REGIME_WEIGHTS[regime]
  const signalMap: Record<string, AlgorithmSignal> = {}
  for (const s of signals) signalMap[s.name] = s

  let weightedSum = 0
  let totalWeight = 0

  for (const [name, weight] of Object.entries(weights)) {
    const signal = signalMap[name]
    if (signal) {
      weightedSum += signal.score * weight
      totalWeight += weight
    }
  }

  const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0

  const confidence = computeConfidence(signals, compositeScore, regime)

  return {
    compositeScore: Math.round(compositeScore * 100) / 100,
    regime,
    confidence: Math.round(confidence * 1000) / 1000,
    signals,
    timestamp: new Date(),
  }
}

function computeConfidence(
  signals: AlgorithmSignal[],
  compositeScore: number,
  _regime: MarketRegime,
): number {
  const direction = compositeScore > 0 ? 1 : compositeScore < 0 ? -1 : 0
  const agreeing = signals.filter((s) => {
    if (direction === 0) return Math.abs(s.score) < 10
    return Math.sign(s.score) === direction
  }).length

  const agreement = agreeing / signals.length

  const avgSignalConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length

  const scoreClarity = Math.min(1, Math.abs(compositeScore) / 50)

  return Math.min(1, agreement * 0.4 + avgSignalConfidence * 0.3 + scoreClarity * 0.3)
}
