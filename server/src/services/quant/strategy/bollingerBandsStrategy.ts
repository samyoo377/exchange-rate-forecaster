import type { QuantStrategy, StrategyContext, StrategySignal } from "../fxTypes.js"
import { computeBollingerBands } from "../algorithms/bollingerBands.js"
import { fxBarsToQuantBars, toDirection, computeDataQualityImpact } from "./utils.js"

export const bollingerBandsStrategy: QuantStrategy = {
  key: "bollingerBands",
  displayName: "布林带",
  version: "1.0.0",
  supportedIntervals: ["4h", "1d"],
  supportsSynthetic: false,

  evaluate(context: StrategyContext): StrategySignal {
    const quantBars = fxBarsToQuantBars(context.bars)
    const result = computeBollingerBands(quantBars)
    const qualityImpact = computeDataQualityImpact(context.bars, false)

    return {
      strategyKey: "bollingerBands",
      strategyVersion: "1.0.0",
      score: result.score,
      confidence: result.confidence * qualityImpact,
      direction: toDirection(result.score),
      rationale: [result.description],
      evidence: result.metadata ?? {},
      dataQualityImpact: qualityImpact,
    }
  },
}
