import type { QuantBar, AlgorithmSignal } from "../types.js"

export function computeMeanReversion(bars: QuantBar[]): AlgorithmSignal {
  if (bars.length < 25) {
    return { name: "meanReversion", score: 0, confidence: 0, description: "数据不足" }
  }

  const period = 20
  const closes = bars.map((b) => b.close)
  const recent = closes.slice(-period)

  const sma = recent.reduce((a, b) => a + b, 0) / period
  const stdDev = Math.sqrt(recent.reduce((sum, v) => sum + (v - sma) ** 2, 0) / period)

  const currentPrice = closes[closes.length - 1]
  const zScore = stdDev > 0 ? (currentPrice - sma) / stdDev : 0

  let score: number
  let description: string

  if (zScore > 2.0) {
    score = -80
    description = `价格严重偏离均线上方 (Z=${zScore.toFixed(2)}), 回归压力大`
  } else if (zScore > 1.5) {
    score = -50
    description = `价格偏离均线上方 (Z=${zScore.toFixed(2)}), 有回归倾向`
  } else if (zScore > 1.0) {
    score = -25
    description = `价格略高于均线 (Z=${zScore.toFixed(2)})`
  } else if (zScore < -2.0) {
    score = 80
    description = `价格严重偏离均线下方 (Z=${zScore.toFixed(2)}), 回归压力大`
  } else if (zScore < -1.5) {
    score = 50
    description = `价格偏离均线下方 (Z=${zScore.toFixed(2)}), 有回归倾向`
  } else if (zScore < -1.0) {
    score = 25
    description = `价格略低于均线 (Z=${zScore.toFixed(2)})`
  } else {
    score = -zScore * 10
    description = `价格接近均线 (Z=${zScore.toFixed(2)})`
  }

  score = clamp(score, -100, 100)
  const confidence = Math.min(1, Math.abs(zScore) * 0.3 + 0.2)

  return {
    name: "meanReversion",
    score,
    confidence,
    description,
    metadata: { zScore, sma, stdDev, deviation: currentPrice - sma },
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}
