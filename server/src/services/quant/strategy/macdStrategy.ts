import type { QuantStrategy, StrategyContext, StrategySignal } from "../fxTypes.js"
import { computeMacd } from "../algorithms/macd.js"
import { fxBarsToQuantBars, toDirection, computeDataQualityImpact } from "./utils.js"

export const macdStrategy: QuantStrategy = {
  key: "macd",
  displayName: "MACD",
  version: "1.0.0",
  supportedIntervals: ["1h", "4h", "1d"],
  supportsSynthetic: true,

  evaluate(context: StrategyContext): StrategySignal {
    const quantBars = fxBarsToQuantBars(context.bars)
    const result = computeMacd(quantBars)
    const qualityImpact = computeDataQualityImpact(context.bars, true)

    return {
      strategyKey: "macd",
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
