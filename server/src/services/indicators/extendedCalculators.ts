import type { OhlcBar } from "../../types/index.js"

function ema(arr: number[], period: number): number[] {
  const result: number[] = Array(arr.length).fill(NaN)
  const k = 2 / (period + 1)
  let prev = arr.slice(0, period).reduce((a, b) => a + b, 0) / period
  result[period - 1] = prev
  for (let i = period; i < arr.length; i++) {
    prev = arr[i] * k + prev * (1 - k)
    result[i] = prev
  }
  return result
}

function smaArr(arr: number[], period: number): number[] {
  const result: number[] = Array(arr.length).fill(NaN)
  for (let i = period - 1; i < arr.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += arr[j]
    result[i] = sum / period
  }
  return result
}

function wma(arr: number[], period: number): number[] {
  const result: number[] = Array(arr.length).fill(NaN)
  const denom = (period * (period + 1)) / 2
  for (let i = period - 1; i < arr.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += arr[i - period + 1 + j] * (j + 1)
    }
    result[i] = sum / denom
  }
  return result
}

export function calcMacd(bars: OhlcBar[], fast = 12, slow = 26, signal = 9): {
  macd: (number | null)[]
  signal: (number | null)[]
  histogram: (number | null)[]
} {
  const close = bars.map((b) => b.close)
  const emaFast = ema(close, fast)
  const emaSlow = ema(close, slow)

  const macdLine: number[] = close.map((_, i) =>
    isNaN(emaFast[i]) || isNaN(emaSlow[i]) ? NaN : emaFast[i] - emaSlow[i],
  )

  const validMacd = macdLine.filter((v) => !isNaN(v))
  const signalLine = ema(
    macdLine.slice(slow - 1),
    signal,
  )

  const n = bars.length
  const result = {
    macd: Array(n).fill(null) as (number | null)[],
    signal: Array(n).fill(null) as (number | null)[],
    histogram: Array(n).fill(null) as (number | null)[],
  }

  for (let i = slow - 1; i < n; i++) {
    if (!isNaN(macdLine[i])) result.macd[i] = macdLine[i]
  }

  const signalOffset = slow - 1 + signal - 1
  for (let i = 0; i < signalLine.length; i++) {
    const idx = i + slow - 1
    if (idx < n && !isNaN(signalLine[i])) {
      result.signal[idx] = signalLine[i]
      if (result.macd[idx] !== null) {
        result.histogram[idx] = result.macd[idx]! - signalLine[i]
      }
    }
  }

  return result
}

export function calcStochRsi(bars: OhlcBar[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3): {
  k: (number | null)[]
  d: (number | null)[]
} {
  const n = bars.length
  const k: (number | null)[] = Array(n).fill(null)
  const d: (number | null)[] = Array(n).fill(null)

  const gains: number[] = []
  const losses: number[] = []
  for (let i = 1; i < n; i++) {
    const diff = bars[i].close - bars[i - 1].close
    gains.push(Math.max(diff, 0))
    losses.push(Math.max(-diff, 0))
  }

  const rsiValues: number[] = Array(n).fill(NaN)
  if (gains.length >= rsiPeriod) {
    let avgGain = gains.slice(0, rsiPeriod).reduce((a, b) => a + b, 0) / rsiPeriod
    let avgLoss = losses.slice(0, rsiPeriod).reduce((a, b) => a + b, 0) / rsiPeriod
    for (let i = rsiPeriod; i < n; i++) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
      rsiValues[i] = 100 - 100 / (1 + rs)
      if (i < gains.length) {
        avgGain = (avgGain * (rsiPeriod - 1) + gains[i]) / rsiPeriod
        avgLoss = (avgLoss * (rsiPeriod - 1) + losses[i]) / rsiPeriod
      }
    }
  }

  const rawK: number[] = Array(n).fill(NaN)
  for (let i = rsiPeriod + stochPeriod - 1; i < n; i++) {
    const slice = rsiValues.slice(i - stochPeriod + 1, i + 1)
    const validSlice = slice.filter((v) => !isNaN(v))
    if (validSlice.length < stochPeriod) continue
    const hh = Math.max(...validSlice)
    const ll = Math.min(...validSlice)
    rawK[i] = hh === ll ? 50 : ((rsiValues[i] - ll) / (hh - ll)) * 100
  }

  const smoothedK = smaArr(rawK.map((v) => (isNaN(v) ? 0 : v)), kSmooth)
  for (let i = 0; i < n; i++) {
    if (!isNaN(rawK[i]) && !isNaN(smoothedK[i])) k[i] = smoothedK[i]
  }

  const kVals = k.map((v) => v ?? NaN)
  const smoothedD = smaArr(kVals.map((v) => (isNaN(v) ? 0 : v)), dSmooth)
  for (let i = 0; i < n; i++) {
    if (k[i] !== null && !isNaN(smoothedD[i])) d[i] = smoothedD[i]
  }

  return { k, d }
}

export function calcWilliamsR(bars: OhlcBar[], period = 14): (number | null)[] {
  const n = bars.length
  const result: (number | null)[] = Array(n).fill(null)

  for (let i = period - 1; i < n; i++) {
    const slice = bars.slice(i - period + 1, i + 1)
    const hh = Math.max(...slice.map((b) => b.high))
    const ll = Math.min(...slice.map((b) => b.low))
    result[i] = hh === ll ? -50 : ((hh - bars[i].close) / (hh - ll)) * -100
  }

  return result
}

export function calcBullBearPower(bars: OhlcBar[], period = 13): {
  bull: (number | null)[]
  bear: (number | null)[]
} {
  const close = bars.map((b) => b.close)
  const emaValues = ema(close, period)
  const n = bars.length

  const bull: (number | null)[] = Array(n).fill(null)
  const bear: (number | null)[] = Array(n).fill(null)

  for (let i = period - 1; i < n; i++) {
    if (!isNaN(emaValues[i])) {
      bull[i] = bars[i].high - emaValues[i]
      bear[i] = bars[i].low - emaValues[i]
    }
  }

  return { bull, bear }
}

export function calcUltimateOscillator(bars: OhlcBar[], p1 = 7, p2 = 14, p3 = 28): (number | null)[] {
  const n = bars.length
  const result: (number | null)[] = Array(n).fill(null)
  if (n < p3 + 1) return result

  const bp: number[] = [0]
  const tr: number[] = [0]

  for (let i = 1; i < n; i++) {
    const prevClose = bars[i - 1].close
    const low = Math.min(bars[i].low, prevClose)
    bp.push(bars[i].close - low)
    tr.push(Math.max(bars[i].high, prevClose) - low)
  }

  for (let i = p3; i < n; i++) {
    const avg1 = sum(bp, i, p1) / sum(tr, i, p1)
    const avg2 = sum(bp, i, p2) / sum(tr, i, p2)
    const avg3 = sum(bp, i, p3) / sum(tr, i, p3)
    result[i] = ((4 * avg1 + 2 * avg2 + avg3) / 7) * 100
  }

  return result
}

function sum(arr: number[], end: number, period: number): number {
  let s = 0
  for (let i = end - period + 1; i <= end; i++) s += arr[i]
  return s || 1
}

export function calcEma(bars: OhlcBar[], period = 10): (number | null)[] {
  const close = bars.map((b) => b.close)
  const values = ema(close, period)
  return values.map((v) => (isNaN(v) ? null : v))
}

export function calcSma(bars: OhlcBar[], period = 10): (number | null)[] {
  const close = bars.map((b) => b.close)
  const values = smaArr(close, period)
  return values.map((v) => (isNaN(v) ? null : v))
}

export function calcVwma(bars: OhlcBar[], period = 20): (number | null)[] {
  const n = bars.length
  const result: (number | null)[] = Array(n).fill(null)

  for (let i = period - 1; i < n; i++) {
    let sumPV = 0
    let sumV = 0
    for (let j = i - period + 1; j <= i; j++) {
      const vol = bars[j].volume ?? 1
      sumPV += bars[j].close * vol
      sumV += vol
    }
    result[i] = sumV === 0 ? null : sumPV / sumV
  }

  return result
}

export function calcHma(bars: OhlcBar[], period = 9): (number | null)[] {
  const close = bars.map((b) => b.close)
  const halfPeriod = Math.floor(period / 2)
  const sqrtPeriod = Math.floor(Math.sqrt(period))

  const wmaHalf = wma(close, halfPeriod)
  const wmaFull = wma(close, period)

  const diff: number[] = close.map((_, i) =>
    isNaN(wmaHalf[i]) || isNaN(wmaFull[i]) ? NaN : 2 * wmaHalf[i] - wmaFull[i],
  )

  const validDiff = diff.filter((v) => !isNaN(v))
  if (validDiff.length < sqrtPeriod) return Array(bars.length).fill(null)

  const hmaRaw = wma(diff.map((v) => (isNaN(v) ? 0 : v)), sqrtPeriod)

  return hmaRaw.map((v, i) => (isNaN(v) || isNaN(diff[i]) ? null : v))
}

export function calcIchimoku(bars: OhlcBar[], tenkan = 9, kijun = 26, senkou = 52): {
  tenkanSen: (number | null)[]
  kijunSen: (number | null)[]
  senkouA: (number | null)[]
  senkouB: (number | null)[]
} {
  const n = bars.length
  const tenkanSen: (number | null)[] = Array(n).fill(null)
  const kijunSen: (number | null)[] = Array(n).fill(null)
  const senkouA: (number | null)[] = Array(n).fill(null)
  const senkouB: (number | null)[] = Array(n).fill(null)

  for (let i = tenkan - 1; i < n; i++) {
    const slice = bars.slice(i - tenkan + 1, i + 1)
    tenkanSen[i] = (Math.max(...slice.map((b) => b.high)) + Math.min(...slice.map((b) => b.low))) / 2
  }

  for (let i = kijun - 1; i < n; i++) {
    const slice = bars.slice(i - kijun + 1, i + 1)
    kijunSen[i] = (Math.max(...slice.map((b) => b.high)) + Math.min(...slice.map((b) => b.low))) / 2
  }

  for (let i = kijun - 1; i < n; i++) {
    if (tenkanSen[i] !== null && kijunSen[i] !== null) {
      senkouA[i] = (tenkanSen[i]! + kijunSen[i]!) / 2
    }
  }

  for (let i = senkou - 1; i < n; i++) {
    const slice = bars.slice(i - senkou + 1, i + 1)
    senkouB[i] = (Math.max(...slice.map((b) => b.high)) + Math.min(...slice.map((b) => b.low))) / 2
  }

  return { tenkanSen, kijunSen, senkouA, senkouB }
}

export function calcPivotPoints(bars: OhlcBar[]): {
  pp: (number | null)[]
  r1: (number | null)[]
  r2: (number | null)[]
  r3: (number | null)[]
  s1: (number | null)[]
  s2: (number | null)[]
  s3: (number | null)[]
} {
  const n = bars.length
  const pp: (number | null)[] = Array(n).fill(null)
  const r1: (number | null)[] = Array(n).fill(null)
  const r2: (number | null)[] = Array(n).fill(null)
  const r3: (number | null)[] = Array(n).fill(null)
  const s1: (number | null)[] = Array(n).fill(null)
  const s2: (number | null)[] = Array(n).fill(null)
  const s3: (number | null)[] = Array(n).fill(null)

  for (let i = 1; i < n; i++) {
    const prev = bars[i - 1]
    const pivot = (prev.high + prev.low + prev.close) / 3
    pp[i] = pivot
    r1[i] = 2 * pivot - prev.low
    s1[i] = 2 * pivot - prev.high
    r2[i] = pivot + (prev.high - prev.low)
    s2[i] = pivot - (prev.high - prev.low)
    r3[i] = prev.high + 2 * (pivot - prev.low)
    s3[i] = prev.low - 2 * (prev.high - pivot)
  }

  return { pp, r1, r2, r3, s1, s2, s3 }
}
