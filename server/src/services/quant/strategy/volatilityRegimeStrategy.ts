import type { QuantStrategy, StrategyContext, StrategySignal } from "../fxTypes.js"
import { computeVolatilityRegime } from "../algorithms/volatilityRegime.js"
import { fxBarsToQuantBars, toDirection, computeDataQualityImpact } from "./utils.js"

export const volatilityRegimeStrategy: QuantStrategy = {
  key: "volatility",
  displayName: "波动率状态",
  version: "1.0.0",
  supportedIntervals: ["4h", "1d"],
  supportsSynthetic: false,
  supportedRegimes: ["volatile", "ranging"],

  evaluate(context: StrategyContext): StrategySignal {
    const quantBars = fxBarsToQuantBars(context.bars)
    const result = computeVolatilityRegime(quantBars)
    const qualityImpact = computeDataQualityImpact(context.bars, false)

    return {
      strategyKey: "volatility",
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
