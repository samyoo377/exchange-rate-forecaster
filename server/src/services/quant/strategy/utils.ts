import type { QuantStrategy, StrategyContext, StrategySignal, FxBar } from "../fxTypes.js"
import type { QuantBar } from "../types.js"

function fxBarsToQuantBars(bars: FxBar[]): QuantBar[] {
  return bars.map((b) => ({
    date: b.timestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    source: b.source,
    synthetic: b.isSynthetic,
  }))
}

function toDirection(score: number): "bullish" | "bearish" | "neutral" {
  if (score > 15) return "bullish"
  if (score < -15) return "bearish"
  return "neutral"
}

function computeDataQualityImpact(bars: FxBar[], supportsSynthetic: boolean): number {
  const syntheticRatio = bars.filter((b) => b.isSynthetic).length / bars.length
  if (!supportsSynthetic && syntheticRatio > 0.5) return 0.3
  if (syntheticRatio > 0.8) return 0.5
  if (syntheticRatio > 0.3) return 0.8
  return 1.0
}

export { fxBarsToQuantBars, toDirection, computeDataQualityImpact }
