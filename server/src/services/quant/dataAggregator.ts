import { prisma } from "../../utils/db.js"
import type { QuantBar, DataSourceStatus } from "./types.js"
import { fetchFromAlphaVantage } from "./sources/alphaVantageSource.js"
import { fetchFromYahoo } from "./sources/yahooSource.js"
import { fetchFromFrankfurter } from "./sources/frankfurterSource.js"
import { fetchFromEcb } from "./sources/ecbSource.js"

interface SourceEntry {
  name: string
  priority: number
  fetchFn: (symbol: string, days: number) => Promise<QuantBar[]>
  failureCount: number
  disabledUntil: number | null
}

const CIRCUIT_BREAKER_THRESHOLD = 5
const CIRCUIT_BREAKER_COOLDOWN_MS = 60 * 60 * 1000

const sources: SourceEntry[] = [
  { name: "alpha_vantage", priority: 1, fetchFn: fetchFromAlphaVantage, failureCount: 0, disabledUntil: null },
  { name: "yahoo_finance", priority: 2, fetchFn: fetchFromYahoo, failureCount: 0, disabledUntil: null },
  { name: "frankfurter", priority: 3, fetchFn: fetchFromFrankfurter, failureCount: 0, disabledUntil: null },
  { name: "ecb", priority: 4, fetchFn: fetchFromEcb, failureCount: 0, disabledUntil: null },
]

export async function fetchBars(symbol: string, days = 120): Promise<QuantBar[]> {
  const now = Date.now()
  const availableSources = sources
    .filter((s) => !s.disabledUntil || now > s.disabledUntil)
    .sort((a, b) => a.priority - b.priority)

  if (availableSources.length === 0) {
    sources.forEach((s) => { s.disabledUntil = null; s.failureCount = 0 })
    return fetchBars(symbol, days)
  }

  for (const source of availableSources) {
    try {
      const t0 = Date.now()
      const bars = await source.fetchFn(symbol, days)
      const latencyMs = Date.now() - t0

      source.failureCount = 0
      source.disabledUntil = null

      await recordSuccess(source.name, latencyMs).catch(() => {})

      if (bars.length < 20) {
        throw new Error(`${source.name} returned insufficient data (${bars.length} bars)`)
      }

      return bars
    } catch (error) {
      source.failureCount++
      const errMsg = error instanceof Error ? error.message : String(error)

      if (source.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
        source.disabledUntil = now + CIRCUIT_BREAKER_COOLDOWN_MS
      }

      await recordFailure(source.name, errMsg).catch(() => {})
    }
  }

  throw new Error(`All data sources failed for ${symbol}`)
}

export async function getSourcesHealth(): Promise<DataSourceStatus[]> {
  const records = await prisma.dataSourceHealth.findMany({
    orderBy: { priority: "asc" },
  })

  return records.map((r) => ({
    name: r.sourceName,
    healthy: r.enabled && r.failureCount < CIRCUIT_BREAKER_THRESHOLD,
    lastLatencyMs: r.avgLatencyMs,
    successRate: r.successCount + r.failureCount > 0
      ? r.successCount / (r.successCount + r.failureCount)
      : 1,
    lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
    lastError: r.lastError,
  }))
}

async function recordSuccess(sourceName: string, latencyMs: number) {
  await prisma.dataSourceHealth.upsert({
    where: { sourceName },
    create: {
      sourceName,
      enabled: true,
      priority: sources.find((s) => s.name === sourceName)?.priority ?? 99,
      successCount: 1,
      failureCount: 0,
      lastSuccessAt: new Date(),
      avgLatencyMs: latencyMs,
    },
    update: {
      successCount: { increment: 1 },
      lastSuccessAt: new Date(),
      avgLatencyMs: latencyMs,
      lastError: null,
    },
  })
}

async function recordFailure(sourceName: string, error: string) {
  await prisma.dataSourceHealth.upsert({
    where: { sourceName },
    create: {
      sourceName,
      enabled: true,
      priority: sources.find((s) => s.name === sourceName)?.priority ?? 99,
      successCount: 0,
      failureCount: 1,
      lastFailureAt: new Date(),
      lastError: error,
      avgLatencyMs: 0,
    },
    update: {
      failureCount: { increment: 1 },
      lastFailureAt: new Date(),
      lastError: error,
    },
  })
}
