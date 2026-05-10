import type { QuantStrategy, StrategyContext, StrategySignal } from "../fxTypes.js"
import { computeMeanReversion } from "../algorithms/meanReversion.js"
import { fxBarsToQuantBars, toDirection, computeDataQualityImpact } from "./utils.js"

export const meanReversionStrategy: QuantStrategy = {
  key: "meanReversion",
  displayName: "均值回归",
  version: "1.0.0",
  supportedIntervals: ["1h", "4h", "1d"],
  supportsSynthetic: true,

  evaluate(context: StrategyContext): StrategySignal {
    const quantBars = fxBarsToQuantBars(context.bars)
    const result = computeMeanReversion(quantBars)
    const qualityImpact = computeDataQualityImpact(context.bars, true)

    return {
      strategyKey: "meanReversion",
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
