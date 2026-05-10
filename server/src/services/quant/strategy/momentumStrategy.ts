import type { QuantStrategy, StrategyContext, StrategySignal } from "../fxTypes.js"
import { computeMomentum } from "../algorithms/momentum.js"
import { fxBarsToQuantBars, toDirection, computeDataQualityImpact } from "./utils.js"

export const momentumStrategy: QuantStrategy = {
  key: "momentum",
  displayName: "动量",
  version: "1.0.0",
  supportedIntervals: ["1h", "4h", "1d"],
  supportsSynthetic: true,

  evaluate(context: StrategyContext): StrategySignal {
    const quantBars = fxBarsToQuantBars(context.bars)
    const result = computeMomentum(quantBars)
    const qualityImpact = computeDataQualityImpact(context.bars, true)

    return {
      strategyKey: "momentum",
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
