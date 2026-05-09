import type { QuantBar, AlgorithmSignal } from "../types.js"

export function computeMomentum(bars: QuantBar[]): AlgorithmSignal {
  if (bars.length < 25) {
    return { name: "momentum", score: 0, confidence: 0, description: "数据不足" }
  }

  const closes = bars.map((b) => b.close)

  const roc5 = (closes[closes.length - 1] / closes[closes.length - 6] - 1) * 100
  const roc10 = (closes[closes.length - 1] / closes[closes.length - 11] - 1) * 100
  const roc20 = (closes[closes.length - 1] / closes[closes.length - 21] - 1) * 100

  const rsi14 = computeRsi(closes, 14)

  const allPositive = roc5 > 0 && roc10 > 0 && roc20 > 0
  const allNegative = roc5 < 0 && roc10 < 0 && roc20 < 0
  const aligned = allPositive || allNegative

  const weightedRoc = roc5 * 0.5 + roc10 * 0.3 + roc20 * 0.2

  let score: number
  let description: string

  if (aligned && allPositive) {
    score = Math.min(90, weightedRoc * 30 + 20)
    description = `多周期动量一致向上 (ROC5=${roc5.toFixed(2)}%, ROC10=${roc10.toFixed(2)}%)`
  } else if (aligned && allNegative) {
    score = Math.max(-90, weightedRoc * 30 - 20)
    description = `多周期动量一致向下 (ROC5=${roc5.toFixed(2)}%, ROC10=${roc10.toFixed(2)}%)`
  } else {
    score = weightedRoc * 20
    description = `动量信号分歧 (ROC5=${roc5.toFixed(2)}%, ROC10=${roc10.toFixed(2)}%, ROC20=${roc20.toFixed(2)}%)`
  }

  if (rsi14 > 70) {
    score = Math.min(score, score * 0.7)
    description += `, RSI超买(${rsi14.toFixed(0)})`
  } else if (rsi14 < 30) {
    score = Math.max(score, score * 0.7)
    description += `, RSI超卖(${rsi14.toFixed(0)})`
  }

  score = clamp(score, -100, 100)
  const confidence = aligned ? Math.min(1, Math.abs(weightedRoc) * 0.3 + 0.4) : 0.3

  return {
    name: "momentum",
    score,
    confidence,
    description,
    metadata: { roc5, roc10, roc20, rsi14, aligned: aligned ? 1 : 0 },
  }
}

function computeRsi(closes: number[], period: number): number {
  let gains = 0
  let losses = 0

  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }

  const avgGain = gains / period
  const avgLoss = losses / period

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}
