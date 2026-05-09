import type { QuantBar, AlgorithmSignal } from "../types.js"

export function computeMacd(bars: QuantBar[]): AlgorithmSignal {
  if (bars.length < 35) {
    return { name: "macd", score: 0, confidence: 0, description: "数据不足" }
  }

  const closes = bars.map((b) => b.close)
  const ema12 = computeEma(closes, 12)
  const ema26 = computeEma(closes, 26)

  const macdLine = ema12.map((v, i) => v - ema26[i])
  const signalLine = computeEma(macdLine.slice(26), 9)
  const macdRecent = macdLine.slice(macdLine.length - signalLine.length)

  const histogram = macdRecent.map((v, i) => v - signalLine[i])

  const currentHist = histogram[histogram.length - 1]
  const prevHist = histogram[histogram.length - 2]
  const currentMacd = macdRecent[macdRecent.length - 1]
  const currentSignal = signalLine[signalLine.length - 1]

  const crossover = currentHist > 0 && prevHist <= 0
  const crossunder = currentHist < 0 && prevHist >= 0

  const divergence = detectDivergence(closes, macdRecent)

  let score: number
  let description: string

  if (crossover) {
    score = 60
    description = "MACD 金叉 (MACD 上穿信号线)"
  } else if (crossunder) {
    score = -60
    description = "MACD 死叉 (MACD 下穿信号线)"
  } else if (currentHist > 0) {
    score = Math.min(50, currentHist / Math.abs(currentSignal || 1) * 100)
    description = `MACD 柱状图为正 (${currentHist.toFixed(4)})`
  } else {
    score = Math.max(-50, currentHist / Math.abs(currentSignal || 1) * 100)
    description = `MACD 柱状图为负 (${currentHist.toFixed(4)})`
  }

  if (divergence === "bullish") {
    score = Math.min(100, score + 30)
    description += " + 底背离"
  } else if (divergence === "bearish") {
    score = Math.max(-100, score - 30)
    description += " + 顶背离"
  }

  score = clamp(score, -100, 100)
  const confidence = Math.min(1, Math.abs(currentHist) / (Math.abs(currentSignal) || 0.001) * 0.5 + 0.3)

  return {
    name: "macd",
    score,
    confidence,
    description,
    metadata: { macd: currentMacd, signal: currentSignal, histogram: currentHist },
  }
}

function detectDivergence(closes: number[], macdLine: number[]): "bullish" | "bearish" | null {
  const lookback = Math.min(20, closes.length, macdLine.length)
  const recentCloses = closes.slice(-lookback)
  const recentMacd = macdLine.slice(-lookback)

  const priceLow1 = Math.min(...recentCloses.slice(0, Math.floor(lookback / 2)))
  const priceLow2 = Math.min(...recentCloses.slice(Math.floor(lookback / 2)))
  const macdLow1 = Math.min(...recentMacd.slice(0, Math.floor(lookback / 2)))
  const macdLow2 = Math.min(...recentMacd.slice(Math.floor(lookback / 2)))

  if (priceLow2 < priceLow1 && macdLow2 > macdLow1) return "bullish"

  const priceHigh1 = Math.max(...recentCloses.slice(0, Math.floor(lookback / 2)))
  const priceHigh2 = Math.max(...recentCloses.slice(Math.floor(lookback / 2)))
  const macdHigh1 = Math.max(...recentMacd.slice(0, Math.floor(lookback / 2)))
  const macdHigh2 = Math.max(...recentMacd.slice(Math.floor(lookback / 2)))

  if (priceHigh2 > priceHigh1 && macdHigh2 < macdHigh1) return "bearish"

  return null
}

function computeEma(data: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const ema: number[] = [data[0]]
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k))
  }
  return ema
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}
