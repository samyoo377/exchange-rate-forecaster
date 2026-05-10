import type { QuantStrategy, StrategyContext, StrategySignal } from "../fxTypes.js"
import { computeSupportResistance } from "../algorithms/supportResistance.js"
import { fxBarsToQuantBars, toDirection, computeDataQualityImpact } from "./utils.js"

export const supportResistanceStrategy: QuantStrategy = {
  key: "supportResistance",
  displayName: "支撑阻力",
  version: "1.0.0",
  supportedIntervals: ["4h", "1d"],
  supportsSynthetic: false,

  evaluate(context: StrategyContext): StrategySignal {
    const quantBars = fxBarsToQuantBars(context.bars)
    const result = computeSupportResistance(quantBars)
    const qualityImpact = computeDataQualityImpact(context.bars, false)

    return {
      strategyKey: "supportResistance",
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
