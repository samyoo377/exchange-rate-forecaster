import type { OhlcBar, IndicatorValues } from "../../types/index.js"

function sma(arr: number[], period: number, end: number): number | null {
  if (end < period - 1) return null
  let sum = 0
  for (let i = end - period + 1; i <= end; i++) sum += arr[i]
  return sum / period
}

export function calcRsi14(bars: OhlcBar[]): (number | null)[] {
  const n = bars.length
  const result: (number | null)[] = Array(n).fill(null)
  if (n < 15) return result

  const gains: number[] = []
  const losses: number[] = []

  for (let i = 1; i < n; i++) {
    const diff = bars[i].close - bars[i - 1].close
    gains.push(Math.max(diff, 0))
    losses.push(Math.max(-diff, 0))
  }

  let avgGain = gains.slice(0, 14).reduce((a, b) => a + b, 0) / 14
  let avgLoss = losses.slice(0, 14).reduce((a, b) => a + b, 0) / 14

  for (let i = 14; i < n; i++) {
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result[i] = 100 - 100 / (1 + rs)
    avgGain = (avgGain * 13 + gains[i]) / 14
    avgLoss = (avgLoss * 13 + losses[i]) / 14
  }

  return result
}

export function calcStoch14(bars: OhlcBar[]): { k: (number | null)[]; d: (number | null)[] } {
  const n = bars.length
  const rawK: (number | null)[] = Array(n).fill(null)
  const k: (number | null)[] = Array(n).fill(null)
  const d: (number | null)[] = Array(n).fill(null)

  for (let i = 13; i < n; i++) {
    const slice = bars.slice(i - 13, i + 1)
    const h14 = Math.max(...slice.map((b) => b.high))
    const l14 = Math.min(...slice.map((b) => b.low))
    rawK[i] = h14 === l14 ? 50 : (100 * (bars[i].close - l14)) / (h14 - l14)
  }

  for (let i = 15; i < n; i++) {
    const vals = [rawK[i], rawK[i - 1], rawK[i - 2]].filter((v): v is number => v !== null)
    if (vals.length === 3) k[i] = vals.reduce((a, b) => a + b, 0) / 3
  }

  for (let i = 17; i < n; i++) {
    const vals = [k[i], k[i - 1], k[i - 2]].filter((v): v is number => v !== null)
    if (vals.length === 3) d[i] = vals.reduce((a, b) => a + b, 0) / 3
  }

  return { k, d }
}

export function calcCci20(bars: OhlcBar[]): (number | null)[] {
  const n = bars.length
  const result: (number | null)[] = Array(n).fill(null)
  if (n < 20) return result

  const tp = bars.map((b) => (b.high + b.low + b.close) / 3)

  for (let i = 19; i < n; i++) {
    const slice = tp.slice(i - 19, i + 1)
    const ma = slice.reduce((a, b) => a + b, 0) / 20
    const md = slice.reduce((acc, v) => acc + Math.abs(v - ma), 0) / 20
    result[i] = md === 0 ? 0 : (tp[i] - ma) / (0.015 * md)
  }

  return result
}

export function calcAdx14(bars: OhlcBar[]): {
  adx: (number | null)[]
  plusDi: (number | null)[]
  minusDi: (number | null)[]
} {
  const n = bars.length
  const adx: (number | null)[] = Array(n).fill(null)
  const plusDi: (number | null)[] = Array(n).fill(null)
  const minusDi: (number | null)[] = Array(n).fill(null)
  if (n < 28) return { adx, plusDi, minusDi }

  const trArr: number[] = [0]
  const dmPlus: number[] = [0]
  const dmMinus: number[] = [0]

  for (let i = 1; i < n; i++) {
    const h = bars[i].high, l = bars[i].low, c = bars[i].close
    const ph = bars[i - 1].high, pl = bars[i - 1].low, pc = bars[i - 1].close
    trArr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
    const up = h - ph
    const down = pl - l
    dmPlus.push(up > down && up > 0 ? up : 0)
    dmMinus.push(down > up && down > 0 ? down : 0)
  }

  let atr = trArr.slice(1, 15).reduce((a, b) => a + b, 0)
  let sDmPlus = dmPlus.slice(1, 15).reduce((a, b) => a + b, 0)
  let sDmMinus = dmMinus.slice(1, 15).reduce((a, b) => a + b, 0)

  const diPlus: number[] = Array(n).fill(0)
  const diMinus: number[] = Array(n).fill(0)

  for (let i = 14; i < n; i++) {
    atr = atr - atr / 14 + trArr[i]
    sDmPlus = sDmPlus - sDmPlus / 14 + dmPlus[i]
    sDmMinus = sDmMinus - sDmMinus / 14 + dmMinus[i]

    diPlus[i] = atr === 0 ? 0 : (100 * sDmPlus) / atr
    diMinus[i] = atr === 0 ? 0 : (100 * sDmMinus) / atr
    plusDi[i] = diPlus[i]
    minusDi[i] = diMinus[i]
  }

  const dx: number[] = Array(n).fill(0)
  for (let i = 14; i < n; i++) {
    const sum = diPlus[i] + diMinus[i]
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(diPlus[i] - diMinus[i])) / sum
  }

  let adxVal = dx.slice(14, 28).reduce((a, b) => a + b, 0) / 14
  adx[27] = adxVal

  for (let i = 28; i < n; i++) {
    adxVal = (adxVal * 13 + dx[i]) / 14
    adx[i] = adxVal
  }

  return { adx, plusDi, minusDi }
}

export function calcAo(bars: OhlcBar[]): (number | null)[] {
  const n = bars.length
  const result: (number | null)[] = Array(n).fill(null)
  const mp = bars.map((b) => (b.high + b.low) / 2)

  for (let i = 33; i < n; i++) {
    const sma5 = sma(mp, 5, i)
    const sma34 = sma(mp, 34, i)
    if (sma5 !== null && sma34 !== null) result[i] = sma5 - sma34
  }

  return result
}

export function calcMom10(bars: OhlcBar[]): (number | null)[] {
  return bars.map((b, i) => (i < 10 ? null : b.close - bars[i - 10].close))
}

export function computeAllIndicators(bars: OhlcBar[]): IndicatorValues {
  const rsiArr = calcRsi14(bars)
  const stoch = calcStoch14(bars)
  const cciArr = calcCci20(bars)
  const adxCalc = calcAdx14(bars)
  const aoArr = calcAo(bars)
  const momArr = calcMom10(bars)

  const last = bars.length - 1
  return {
    rsi14: rsiArr[last] ?? undefined,
    stochK: stoch.k[last] ?? undefined,
    stochD: stoch.d[last] ?? undefined,
    cci20: cciArr[last] ?? undefined,
    adx14: adxCalc.adx[last] ?? undefined,
    plusDi14: adxCalc.plusDi[last] ?? undefined,
    minusDi14: adxCalc.minusDi[last] ?? undefined,
    ao: aoArr[last] ?? undefined,
    mom10: momArr[last] ?? undefined,
  }
}

export function computeIndicatorSeries(bars: OhlcBar[]): IndicatorValues[] {
  const rsiArr = calcRsi14(bars)
  const stoch = calcStoch14(bars)
  const cciArr = calcCci20(bars)
  const adxCalc = calcAdx14(bars)
  const aoArr = calcAo(bars)
  const momArr = calcMom10(bars)

  return bars.map((_, i) => ({
    rsi14: rsiArr[i] ?? undefined,
    stochK: stoch.k[i] ?? undefined,
    stochD: stoch.d[i] ?? undefined,
    cci20: cciArr[i] ?? undefined,
    adx14: adxCalc.adx[i] ?? undefined,
    plusDi14: adxCalc.plusDi[i] ?? undefined,
    minusDi14: adxCalc.minusDi[i] ?? undefined,
    ao: aoArr[i] ?? undefined,
    mom10: momArr[i] ?? undefined,
  }))
}
