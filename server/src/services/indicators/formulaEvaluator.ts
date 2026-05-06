import { create, all } from "mathjs"
import type { OhlcBar } from "../../types/index.js"

const math = create(all, {})

function extractSeries(bars: OhlcBar[], field: "open" | "high" | "low" | "close"): number[] {
  return bars.map((b) => b[field])
}

function sma(arr: number[], period: number): number[] {
  const result: number[] = Array(arr.length).fill(NaN)
  for (let i = period - 1; i < arr.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += arr[j]
    result[i] = sum / period
  }
  return result
}

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

function stddev(arr: number[], period: number): number[] {
  const result: number[] = Array(arr.length).fill(NaN)
  for (let i = period - 1; i < arr.length; i++) {
    const slice = arr.slice(i - period + 1, i + 1)
    const mean = slice.reduce((a, b) => a + b, 0) / period
    const variance = slice.reduce((a, v) => a + (v - mean) ** 2, 0) / period
    result[i] = Math.sqrt(variance)
  }
  return result
}

function highest(arr: number[], period: number): number[] {
  const result: number[] = Array(arr.length).fill(NaN)
  for (let i = period - 1; i < arr.length; i++) {
    result[i] = Math.max(...arr.slice(i - period + 1, i + 1))
  }
  return result
}

function lowest(arr: number[], period: number): number[] {
  const result: number[] = Array(arr.length).fill(NaN)
  for (let i = period - 1; i < arr.length; i++) {
    result[i] = Math.min(...arr.slice(i - period + 1, i + 1))
  }
  return result
}

function change(arr: number[], period: number): number[] {
  const result: number[] = Array(arr.length).fill(NaN)
  for (let i = period; i < arr.length; i++) {
    result[i] = arr[i] - arr[i - period]
  }
  return result
}

export function evaluateFormula(
  expression: string,
  bars: OhlcBar[],
  params: Record<string, number>,
): (number | null)[] {
  const n = bars.length
  const close = extractSeries(bars, "close")
  const open = extractSeries(bars, "open")
  const high = extractSeries(bars, "high")
  const low = extractSeries(bars, "low")
  const volume = bars.map((b) => b.volume ?? 0)

  const period = params.period ?? 14

  const scope: Record<string, any> = {
    ...params,
    close, open, high, low, volume,
    n,
    sma: (arr: number[], p: number) => sma(arr, p),
    ema: (arr: number[], p: number) => ema(arr, p),
    stddev: (arr: number[], p: number) => stddev(arr, p),
    highest: (arr: number[], p: number) => highest(arr, p),
    lowest: (arr: number[], p: number) => lowest(arr, p),
    change: (arr: number[], p: number) => change(arr, p),
    abs: Math.abs,
    max: Math.max,
    min: Math.min,
    sqrt: Math.sqrt,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    exp: Math.exp,
    pow: Math.pow,
    round: Math.round,
    ceil: Math.ceil,
    floor: Math.floor,
    PI: Math.PI,
    E: Math.E,
  }

  try {
    const result = math.evaluate(expression, scope)

    if (Array.isArray(result)) {
      return result.map((v: any) => {
        if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return null
        return Number(v)
      })
    }

    if (typeof result === "number" && isFinite(result)) {
      return Array(n).fill(null).map((_, i) => i === n - 1 ? result : null)
    }

    return Array(n).fill(null)
  } catch (e) {
    console.warn(`[FormulaEval] Failed to evaluate "${expression}":`, (e as Error).message)
    return Array(n).fill(null)
  }
}

export function validateFormula(expression: string): { valid: boolean; error?: string } {
  try {
    math.parse(expression)
    return { valid: true }
  } catch (e) {
    return { valid: false, error: (e as Error).message }
  }
}

export interface StepFormula {
  variable: string
  label: string
  expression: string
  description?: string
}

export function evaluateStepFormulas(
  steps: StepFormula[],
  bars: OhlcBar[],
  params: Record<string, number>,
): { results: Record<string, (number | null)[]>; finalVariable: string } {
  const n = bars.length
  const close = extractSeries(bars, "close")
  const open = extractSeries(bars, "open")
  const high = extractSeries(bars, "high")
  const low = extractSeries(bars, "low")
  const volume = bars.map((b) => b.volume ?? 0)

  const scope: Record<string, any> = {
    ...params,
    close, open, high, low, volume,
    n,
    sma: (arr: number[], p: number) => sma(arr, p),
    ema: (arr: number[], p: number) => ema(arr, p),
    stddev: (arr: number[], p: number) => stddev(arr, p),
    highest: (arr: number[], p: number) => highest(arr, p),
    lowest: (arr: number[], p: number) => lowest(arr, p),
    change: (arr: number[], p: number) => change(arr, p),
    abs: Math.abs,
    max: Math.max,
    min: Math.min,
    sqrt: Math.sqrt,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    exp: Math.exp,
    pow: Math.pow,
    round: Math.round,
    ceil: Math.ceil,
    floor: Math.floor,
    PI: Math.PI,
    E: Math.E,
  }

  const results: Record<string, (number | null)[]> = {}
  let lastVar = ""

  for (const step of steps) {
    try {
      const raw = math.evaluate(step.expression, scope)
      let series: (number | null)[]

      if (Array.isArray(raw)) {
        series = raw.map((v: any) =>
          v === null || v === undefined || isNaN(v) || !isFinite(v) ? null : Number(v),
        )
      } else if (typeof raw === "number" && isFinite(raw)) {
        series = Array(n).fill(raw)
      } else {
        series = Array(n).fill(null)
      }

      results[step.variable] = series
      scope[step.variable] = series
      lastVar = step.variable
    } catch {
      results[step.variable] = Array(n).fill(null)
      scope[step.variable] = Array(n).fill(null)
      lastVar = step.variable
    }
  }

  return { results, finalVariable: lastVar }
}

export function validateStepFormulas(
  steps: StepFormula[],
  params: Record<string, number>,
): { valid: boolean; errors: { step: number; variable: string; error: string }[] } {
  const errors: { step: number; variable: string; error: string }[] = []
  const knownVars = new Set([
    "close", "open", "high", "low", "volume", "n",
    "sma", "ema", "stddev", "highest", "lowest", "change",
    "abs", "max", "min", "sqrt", "sin", "cos", "tan",
    "log", "log2", "log10", "exp", "pow", "round", "ceil", "floor",
    "PI", "E",
    ...Object.keys(params),
  ])

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (!step.variable || !step.expression) {
      errors.push({ step: i, variable: step.variable ?? "", error: "变量名和表达式不能为空" })
      continue
    }
    try {
      math.parse(step.expression)
    } catch (e) {
      errors.push({ step: i, variable: step.variable, error: (e as Error).message })
      continue
    }
    knownVars.add(step.variable)
  }

  return { valid: errors.length === 0, errors }
}
