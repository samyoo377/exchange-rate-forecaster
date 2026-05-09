import type { QuantBar, AlgorithmSignal } from "../types.js"

export function computeSupportResistance(bars: QuantBar[]): AlgorithmSignal {
  if (bars.length < 30) {
    return { name: "supportResistance", score: 0, confidence: 0, description: "数据不足" }
  }

  const currentPrice = bars[bars.length - 1].close
  const levels = findKeyLevels(bars)

  if (levels.length === 0) {
    return { name: "supportResistance", score: 0, confidence: 0.2, description: "未检测到明显支撑/阻力位" }
  }

  const nearestSupport = levels
    .filter((l) => l.price < currentPrice)
    .sort((a, b) => b.price - a.price)[0]

  const nearestResistance = levels
    .filter((l) => l.price > currentPrice)
    .sort((a, b) => a.price - b.price)[0]

  const range = (nearestResistance?.price ?? currentPrice * 1.01) - (nearestSupport?.price ?? currentPrice * 0.99)
  const positionInRange = nearestSupport
    ? (currentPrice - nearestSupport.price) / range
    : 0.5

  let score: number
  let description: string

  if (nearestSupport && (currentPrice - nearestSupport.price) / currentPrice < 0.002) {
    score = 50 + nearestSupport.strength * 10
    description = `价格接近支撑位 ${nearestSupport.price.toFixed(4)} (强度: ${nearestSupport.strength})`
  } else if (nearestResistance && (nearestResistance.price - currentPrice) / currentPrice < 0.002) {
    score = -(50 + nearestResistance.strength * 10)
    description = `价格接近阻力位 ${nearestResistance.price.toFixed(4)} (强度: ${nearestResistance.strength})`
  } else if (positionInRange < 0.3) {
    score = 30
    description = `价格偏向支撑区域 (位置: ${(positionInRange * 100).toFixed(0)}%)`
  } else if (positionInRange > 0.7) {
    score = -30
    description = `价格偏向阻力区域 (位置: ${(positionInRange * 100).toFixed(0)}%)`
  } else {
    score = 0
    description = `价格在支撑/阻力中间区域 (位置: ${(positionInRange * 100).toFixed(0)}%)`
  }

  score = clamp(score, -100, 100)
  const confidence = Math.min(1, levels.length * 0.15 + 0.2)

  return {
    name: "supportResistance",
    score,
    confidence,
    description,
    metadata: {
      nearestSupport: nearestSupport?.price ?? 0,
      nearestResistance: nearestResistance?.price ?? 0,
      positionInRange,
      levelCount: levels.length,
    },
  }
}

interface PriceLevel {
  price: number
  strength: number
}

function findKeyLevels(bars: QuantBar[]): PriceLevel[] {
  const pivots: number[] = []

  for (let i = 2; i < bars.length - 2; i++) {
    const high = bars[i].high
    const low = bars[i].low

    if (high > bars[i - 1].high && high > bars[i - 2].high &&
        high > bars[i + 1].high && high > bars[i + 2].high) {
      pivots.push(high)
    }
    if (low < bars[i - 1].low && low < bars[i - 2].low &&
        low < bars[i + 1].low && low < bars[i + 2].low) {
      pivots.push(low)
    }
  }

  return clusterLevels(pivots, bars[bars.length - 1].close * 0.003)
}

function clusterLevels(prices: number[], tolerance: number): PriceLevel[] {
  if (prices.length === 0) return []

  const sorted = [...prices].sort((a, b) => a - b)
  const clusters: PriceLevel[] = []
  let clusterStart = sorted[0]
  let clusterSum = sorted[0]
  let clusterCount = 1

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - clusterStart <= tolerance) {
      clusterSum += sorted[i]
      clusterCount++
    } else {
      clusters.push({ price: clusterSum / clusterCount, strength: clusterCount })
      clusterStart = sorted[i]
      clusterSum = sorted[i]
      clusterCount = 1
    }
  }
  clusters.push({ price: clusterSum / clusterCount, strength: clusterCount })

  return clusters.filter((c) => c.strength >= 2).sort((a, b) => b.strength - a.strength)
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}
