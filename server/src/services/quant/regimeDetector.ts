import type { QuantBar, MarketRegime } from "./types.js"
import { computeAtr } from "./algorithms/volatilityRegime.js"

export function detectRegime(bars: QuantBar[]): MarketRegime {
  if (bars.length < 55) return "ranging"

  const { adx, plusDi, minusDi } = computeAdx(bars, 14)
  const atr14 = computeAtr(bars, 14)
  const atr50 = computeAtr(bars, 50)

  const currentAdx = adx[adx.length - 1]
  const currentPlusDi = plusDi[plusDi.length - 1]
  const currentMinusDi = minusDi[minusDi.length - 1]
  const currentAtr14 = atr14[atr14.length - 1]
  const currentAtr50 = atr50[atr50.length - 1]

  const atrRatio = currentAtr50 > 0 ? currentAtr14 / currentAtr50 : 1

  if (atrRatio > 1.5) return "volatile"
  if (currentAdx > 25 && currentPlusDi > currentMinusDi) return "trending_up"
  if (currentAdx > 25 && currentMinusDi > currentPlusDi) return "trending_down"
  return "ranging"
}

function computeAdx(bars: QuantBar[], period: number): {
  adx: number[]
  plusDi: number[]
  minusDi: number[]
} {
  const n = bars.length
  const adx: number[] = []
  const plusDi: number[] = []
  const minusDi: number[] = []

  const trArr: number[] = [0]
  const dmPlus: number[] = [0]
  const dmMinus: number[] = [0]

  for (let i = 1; i < n; i++) {
    const h = bars[i].high
    const l = bars[i].low
    const pc = bars[i - 1].close
    trArr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
    const up = h - bars[i - 1].high
    const down = bars[i - 1].low - l
    dmPlus.push(up > down && up > 0 ? up : 0)
    dmMinus.push(down > up && down > 0 ? down : 0)
  }

  let atr = trArr.slice(1, period + 1).reduce((a, b) => a + b, 0)
  let sDmPlus = dmPlus.slice(1, period + 1).reduce((a, b) => a + b, 0)
  let sDmMinus = dmMinus.slice(1, period + 1).reduce((a, b) => a + b, 0)

  const diPlusArr: number[] = Array(n).fill(0)
  const diMinusArr: number[] = Array(n).fill(0)

  for (let i = period; i < n; i++) {
    atr = atr - atr / period + trArr[i]
    sDmPlus = sDmPlus - sDmPlus / period + dmPlus[i]
    sDmMinus = sDmMinus - sDmMinus / period + dmMinus[i]
    diPlusArr[i] = atr === 0 ? 0 : (100 * sDmPlus) / atr
    diMinusArr[i] = atr === 0 ? 0 : (100 * sDmMinus) / atr
    plusDi.push(diPlusArr[i])
    minusDi.push(diMinusArr[i])
  }

  const dx: number[] = []
  for (let i = 0; i < plusDi.length; i++) {
    const sum = plusDi[i] + minusDi[i]
    dx.push(sum === 0 ? 0 : (100 * Math.abs(plusDi[i] - minusDi[i])) / sum)
  }

  if (dx.length >= period) {
    let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period
    adx.push(adxVal)
    for (let i = period; i < dx.length; i++) {
      adxVal = (adxVal * (period - 1) + dx[i]) / period
      adx.push(adxVal)
    }
  }

  return { adx, plusDi, minusDi }
}
