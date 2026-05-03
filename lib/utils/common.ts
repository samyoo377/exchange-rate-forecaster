import { appConfig } from "@/lib/config"

export function resolveFilePath(inputPath?: string) {
  if (!inputPath || inputPath.trim().length === 0) {
    return appConfig.dataImportDefaultPath
  }
  return inputPath
}

export function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function toISODate(date: Date | string | number) {
  const normalized = new Date(date)
  return normalized.toISOString()
}
