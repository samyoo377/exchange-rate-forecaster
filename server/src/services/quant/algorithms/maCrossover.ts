import type { QuantBar, AlgorithmSignal } from "../types.js"

export function computeMaCrossover(bars: QuantBar[]): AlgorithmSignal {
  if (bars.length < 30) {
    return { name: "maCrossover", score: 0, confidence: 0, description: "数据不足" }
  }

  const closes = bars.map((b) => b.close)
  const ema12 = computeEma(closes, 12)
  const ema26 = computeEma(closes, 26)

  const currentDiff = ema12[ema12.length - 1] - ema26[ema26.length - 1]
  const prevDiff = ema12[ema12.length - 2] - ema26[ema26.length - 2]

  const crossover = currentDiff > 0 && prevDiff <= 0
  const crossunder = currentDiff < 0 && prevDiff >= 0

  const normalizedDiff = (currentDiff / bars[bars.length - 1].close) * 10000

  let score: number
  let description: string

  if (crossover) {
    score = Math.min(80, 50 + Math.abs(normalizedDiff) * 5)
    description = "EMA(12/26) 金叉形成"
  } else if (crossunder) {
    score = Math.max(-80, -50 - Math.abs(normalizedDiff) * 5)
    description = "EMA(12/26) 死叉形成"
  } else if (currentDiff > 0) {
    score = Math.min(60, normalizedDiff * 3)
    description = `EMA(12) 在 EMA(26) 上方, 差值 ${normalizedDiff.toFixed(1)} pips`
  } else {
    score = Math.max(-60, normalizedDiff * 3)
    description = `EMA(12) 在 EMA(26) 下方, 差值 ${Math.abs(normalizedDiff).toFixed(1)} pips`
  }

  score = clamp(score, -100, 100)
  const confidence = Math.min(1, Math.abs(normalizedDiff) / 20 + 0.3)

  return {
    name: "maCrossover",
    score,
    confidence,
    description,
    metadata: { ema12: ema12[ema12.length - 1], ema26: ema26[ema26.length - 1], diff: normalizedDiff },
  }
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
