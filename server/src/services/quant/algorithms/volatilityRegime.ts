import type { QuantBar, AlgorithmSignal } from "../types.js"

export function computeVolatilityRegime(bars: QuantBar[]): AlgorithmSignal {
  if (bars.length < 55) {
    return { name: "volatility", score: 0, confidence: 0, description: "数据不足" }
  }

  const atr14 = computeAtr(bars, 14)
  const atr50 = computeAtr(bars, 50)

  const currentAtr14 = atr14[atr14.length - 1]
  const currentAtr50 = atr50[atr50.length - 1]
  const atrRatio = currentAtr14 / currentAtr50

  const prevAtr14 = atr14[atr14.length - 5]
  const expanding = currentAtr14 > prevAtr14 * 1.1
  const contracting = currentAtr14 < prevAtr14 * 0.9

  let score: number
  let description: string

  if (atrRatio > 1.5) {
    score = expanding ? -15 : 10
    description = `高波动环境 (ATR比值: ${atrRatio.toFixed(2)})${expanding ? ", 波动扩张中" : ""}`
  } else if (atrRatio < 0.7) {
    score = contracting ? 5 : -5
    description = `低波动环境 (ATR比值: ${atrRatio.toFixed(2)})${contracting ? ", 波动收缩中" : ""}`
  } else {
    score = 0
    description = `正常波动水平 (ATR比值: ${atrRatio.toFixed(2)})`
  }

  score = clamp(score, -30, 30)
  const confidence = Math.min(1, Math.abs(atrRatio - 1) + 0.3)

  return {
    name: "volatility",
    score,
    confidence,
    description,
    metadata: { atr14: currentAtr14, atr50: currentAtr50, atrRatio, expanding: expanding ? 1 : 0 },
  }
}

export function computeAtr(bars: QuantBar[], period: number): number[] {
  const trueRanges: number[] = []

  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high
    const low = bars[i].low
    const prevClose = bars[i - 1].close
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
    trueRanges.push(tr)
  }

  const atr: number[] = []
  let sum = 0
  for (let i = 0; i < trueRanges.length; i++) {
    if (i < period) {
      sum += trueRanges[i]
      if (i === period - 1) atr.push(sum / period)
    } else {
      const prev = atr[atr.length - 1]
      atr.push((prev * (period - 1) + trueRanges[i]) / period)
    }
  }

  return atr
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}
