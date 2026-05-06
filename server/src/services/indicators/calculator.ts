import type { OhlcBar, IndicatorValues } from "../../types/index.js"
import { getIndicatorConfigs } from "./configService.js"
import { evaluateFormula, evaluateStepFormulas, type StepFormula } from "./formulaEvaluator.js"

function sma(arr: number[], period: number, end: number): number | null {
  if (end < period - 1) return null
  let sum = 0
  for (let i = end - period + 1; i <= end; i++) sum += arr[i]
  return sum / period
}

// ── Parameterized indicator functions ──

export function calcRsi(bars: OhlcBar[], period = 14): (number | null)[] {
  const n = bars.length
  const result: (number | null)[] = Array(n).fill(null)
  if (n < period + 1) return result

  const gains: number[] = []
  const losses: number[] = []

  for (let i = 1; i < n; i++) {
    const diff = bars[i].close - bars[i - 1].close
    gains.push(Math.max(diff, 0))
    losses.push(Math.max(-diff, 0))
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < n; i++) {
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result[i] = 100 - 100 / (1 + rs)
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
  }

  return result
}

export function calcStoch(bars: OhlcBar[], period = 14, smoothK = 3): { k: (number | null)[]; d: (number | null)[] } {
  const n = bars.length
  const rawK: (number | null)[] = Array(n).fill(null)
  const k: (number | null)[] = Array(n).fill(null)
  const d: (number | null)[] = Array(n).fill(null)

  for (let i = period - 1; i < n; i++) {
    const slice = bars.slice(i - period + 1, i + 1)
    const hMax = Math.max(...slice.map((b) => b.high))
    const lMin = Math.min(...slice.map((b) => b.low))
    rawK[i] = hMax === lMin ? 50 : (100 * (bars[i].close - lMin)) / (hMax - lMin)
  }

  const kStart = period - 1 + smoothK - 1
  for (let i = kStart; i < n; i++) {
    const vals = []
    for (let j = 0; j < smoothK; j++) {
      if (rawK[i - j] !== null) vals.push(rawK[i - j]!)
    }
    if (vals.length === smoothK) k[i] = vals.reduce((a, b) => a + b, 0) / smoothK
  }

  const dStart = kStart + smoothK - 1
  for (let i = dStart; i < n; i++) {
    const vals = []
    for (let j = 0; j < smoothK; j++) {
      if (k[i - j] !== null) vals.push(k[i - j]!)
    }
    if (vals.length === smoothK) d[i] = vals.reduce((a, b) => a + b, 0) / smoothK
  }

  return { k, d }
}

export function calcCci(bars: OhlcBar[], period = 20): (number | null)[] {
  const n = bars.length
  const result: (number | null)[] = Array(n).fill(null)
  if (n < period) return result

  const tp = bars.map((b) => (b.high + b.low + b.close) / 3)

  for (let i = period - 1; i < n; i++) {
    const slice = tp.slice(i - period + 1, i + 1)
    const ma = slice.reduce((a, b) => a + b, 0) / period
    const md = slice.reduce((acc, v) => acc + Math.abs(v - ma), 0) / period
    result[i] = md === 0 ? 0 : (tp[i] - ma) / (0.015 * md)
  }

  return result
}

export function calcAdx(bars: OhlcBar[], period = 14): {
  adx: (number | null)[]
  plusDi: (number | null)[]
  minusDi: (number | null)[]
} {
  const n = bars.length
  const adx: (number | null)[] = Array(n).fill(null)
  const plusDi: (number | null)[] = Array(n).fill(null)
  const minusDi: (number | null)[] = Array(n).fill(null)
  if (n < period * 2) return { adx, plusDi, minusDi }

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
    plusDi[i] = diPlusArr[i]
    minusDi[i] = diMinusArr[i]
  }

  const dx: number[] = Array(n).fill(0)
  for (let i = period; i < n; i++) {
    const sum = diPlusArr[i] + diMinusArr[i]
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(diPlusArr[i] - diMinusArr[i])) / sum
  }

  const adxStart = period * 2
  let adxVal = dx.slice(period, adxStart).reduce((a, b) => a + b, 0) / period
  if (adxStart - 1 < n) adx[adxStart - 1] = adxVal

  for (let i = adxStart; i < n; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period
    adx[i] = adxVal
  }

  return { adx, plusDi, minusDi }
}

export function calcAo(bars: OhlcBar[], shortPeriod = 5, longPeriod = 34): (number | null)[] {
  const n = bars.length
  const result: (number | null)[] = Array(n).fill(null)
  const mp = bars.map((b) => (b.high + b.low) / 2)

  for (let i = longPeriod - 1; i < n; i++) {
    const smaShort = sma(mp, shortPeriod, i)
    const smaLong = sma(mp, longPeriod, i)
    if (smaShort !== null && smaLong !== null) result[i] = smaShort - smaLong
  }

  return result
}

export function calcMom(bars: OhlcBar[], period = 10): (number | null)[] {
  return bars.map((b, i) => (i < period ? null : b.close - bars[i - period].close))
}

// ── Legacy aliases (hardcoded defaults) ──

export const calcRsi14 = (bars: OhlcBar[]) => calcRsi(bars, 14)
export const calcStoch14 = (bars: OhlcBar[]) => calcStoch(bars, 14, 3)
export const calcCci20 = (bars: OhlcBar[]) => calcCci(bars, 20)
export const calcAdx14 = (bars: OhlcBar[]) => calcAdx(bars, 14)
export const calcMom10 = (bars: OhlcBar[]) => calcMom(bars, 10)

// ── Synchronous computation with default params ──

export function computeAllIndicators(bars: OhlcBar[]): IndicatorValues {
  return computeIndicatorSeries(bars)[bars.length - 1] ?? {}
}

export function computeIndicatorSeries(bars: OhlcBar[]): IndicatorValues[] {
  return computeSeriesWithParams(bars)
}

function computeSeriesWithParams(
  bars: OhlcBar[],
  rsiPeriod = 14, stochPeriod = 14, stochSmooth = 3,
  cciPeriod = 20, adxPeriod = 14,
  aoShort = 5, aoLong = 34, momPeriod = 10,
): IndicatorValues[] {
  const rsiArr = calcRsi(bars, rsiPeriod)
  const stoch = calcStoch(bars, stochPeriod, stochSmooth)
  const cciArr = calcCci(bars, cciPeriod)
  const adxCalc = calcAdx(bars, adxPeriod)
  const aoArr = calcAo(bars, aoShort, aoLong)
  const momArr = calcMom(bars, momPeriod)

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

// ── Config-aware async computation ──

const BUILTIN_TYPES = new Set(["RSI", "STOCH", "CCI", "ADX", "AO", "MOM"])

export async function computeIndicatorSeriesFromConfig(bars: OhlcBar[]): Promise<IndicatorValues[]> {
  const configs = await getIndicatorConfigs()

  const rsiP = configs.get("RSI") ? JSON.parse(configs.get("RSI")!.params) : { period: 14 }
  const stochP = configs.get("STOCH") ? JSON.parse(configs.get("STOCH")!.params) : { period: 14, smoothK: 3 }
  const cciP = configs.get("CCI") ? JSON.parse(configs.get("CCI")!.params) : { period: 20 }
  const adxP = configs.get("ADX") ? JSON.parse(configs.get("ADX")!.params) : { period: 14 }
  const aoP = configs.get("AO") ? JSON.parse(configs.get("AO")!.params) : { shortPeriod: 5, longPeriod: 34 }
  const momP = configs.get("MOM") ? JSON.parse(configs.get("MOM")!.params) : { period: 10 }

  const baseSeries = computeSeriesWithParams(
    bars,
    rsiP.period, stochP.period, stochP.smoothK,
    cciP.period, adxP.period,
    aoP.shortPeriod, aoP.longPeriod, momP.period,
  )

  for (const [type, config] of configs) {
    if (BUILTIN_TYPES.has(type)) continue
    if (!config.enabled) continue

    const params = JSON.parse(config.params)
    const key = type.toLowerCase().replace(/-/g, "_")

    try {
      let values: (number | null)[]

      if (config.stepFormulas) {
        const steps: StepFormula[] = JSON.parse(config.stepFormulas)
        if (steps.length > 0) {
          const { results, finalVariable } = evaluateStepFormulas(steps, bars, params)
          values = results[finalVariable] ?? Array(bars.length).fill(null)
          for (const [varName, varValues] of Object.entries(results)) {
            const subKey = `${key}_${varName}`
            for (let i = 0; i < bars.length; i++) {
              ;(baseSeries[i] as any)[subKey] = varValues[i] ?? undefined
            }
          }
        } else {
          continue
        }
      } else if (config.formulaExpression) {
        values = evaluateFormula(config.formulaExpression, bars, params)
      } else {
        continue
      }

      for (let i = 0; i < bars.length; i++) {
        ;(baseSeries[i] as any)[key] = values[i] ?? undefined
      }
    } catch {
      // skip broken custom formulas
    }
  }

  return baseSeries
}
