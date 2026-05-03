import type { ApiResponse } from "../types/index.js"

export function ok<T>(data: T, message = "success"): ApiResponse<T> {
  return { code: 0, message, data }
}

export function err(code: number, message: string): ApiResponse<null> {
  return { code, message, data: null }
}

export function genVersion(symbol: string): string {
  const now = new Date()
  const d = now.toISOString().slice(0, 10).replace(/-/g, "")
  const t = now.getTime()
  return `${symbol}-${d}-${t}`
}

export function toIso(d: Date): string {
  return d.toISOString()
}

export function parseDate(s: string): Date {
  return new Date(s)
}
