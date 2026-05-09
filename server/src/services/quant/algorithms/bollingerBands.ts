import type { QuantBar, AlgorithmSignal } from "../types.js"

export function computeBollingerBands(bars: QuantBar[]): AlgorithmSignal {
  if (bars.length < 25) {
    return { name: "bollingerBands", score: 0, confidence: 0, description: "数据不足" }
  }

  const period = 20
  const closes = bars.map((b) => b.close)
  const recent = closes.slice(-period)

  const sma = recent.reduce((a, b) => a + b, 0) / period
  const stdDev = Math.sqrt(recent.reduce((sum, v) => sum + (v - sma) ** 2, 0) / period)

  const upperBand = sma + 2 * stdDev
  const lowerBand = sma - 2 * stdDev
  const bandwidth = (upperBand - lowerBand) / sma

  const currentPrice = closes[closes.length - 1]
  const percentB = (currentPrice - lowerBand) / (upperBand - lowerBand)

  const prevCloses = closes.slice(-(period + 5), -5)
  const prevSma = prevCloses.reduce((a, b) => a + b, 0) / prevCloses.length
  const prevStdDev = Math.sqrt(prevCloses.reduce((sum, v) => sum + (v - prevSma) ** 2, 0) / prevCloses.length)
  const prevBandwidth = (4 * prevStdDev) / prevSma

  const squeeze = bandwidth < prevBandwidth * 0.7

  let score: number
  let description: string

  if (percentB > 1.0) {
    score = squeeze ? -60 : -40
    description = `价格突破上轨 (%B=${percentB.toFixed(2)})${squeeze ? ", 带宽收缩" : ""}`
  } else if (percentB < 0.0) {
    score = squeeze ? 60 : 40
    description = `价格跌破下轨 (%B=${percentB.toFixed(2)})${squeeze ? ", 带宽收缩" : ""}`
  } else if (percentB > 0.8) {
    score = -30 * (percentB - 0.5) * 2
    description = `价格接近上轨 (%B=${percentB.toFixed(2)})`
  } else if (percentB < 0.2) {
    score = 30 * (0.5 - percentB) * 2
    description = `价格接近下轨 (%B=${percentB.toFixed(2)})`
  } else {
    score = (0.5 - percentB) * 20
    description = `价格在布林带中部 (%B=${percentB.toFixed(2)})`
  }

  score = clamp(score, -100, 100)
  const confidence = Math.min(1, Math.abs(percentB - 0.5) * 1.5 + 0.2)

  return {
    name: "bollingerBands",
    score,
    confidence,
    description,
    metadata: { percentB, bandwidth, upperBand, lowerBand, sma, squeeze: squeeze ? 1 : 0 },
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}
