import type { FxDataSourceAdapter, HistoryRequest, FxBar } from "./fxTypes.js"
import { yahooFxAdapter } from "./sources/yahooFxAdapter.js"
import { frankfurterFxAdapter } from "./sources/frankfurterFxAdapter.js"
import { ecbFxAdapter } from "./sources/ecbFxAdapter.js"
import { prisma } from "../../utils/db.js"

interface AdapterState {
  adapter: FxDataSourceAdapter
  failureCount: number
  disabledUntil: number | null
}

const CIRCUIT_BREAKER_THRESHOLD = 5
const CIRCUIT_BREAKER_COOLDOWN_MS = 60 * 60 * 1000

const adapterStates: AdapterState[] = [
  { adapter: yahooFxAdapter, failureCount: 0, disabledUntil: null },
  { adapter: frankfurterFxAdapter, failureCount: 0, disabledUntil: null },
  { adapter: ecbFxAdapter, failureCount: 0, disabledUntil: null },
]

export function getRegisteredAdapters(): FxDataSourceAdapter[] {
  return adapterStates.map((s) => s.adapter)
}

export async function queryHistory(request: HistoryRequest): Promise<FxBar[]> {
  const now = Date.now()

  const available = adapterStates
    .filter((s) => {
      if (s.disabledUntil && now <= s.disabledUntil) return false
      if (!s.adapter.supports(request.symbol)) return false
      return true
    })
    .sort((a, b) => {
      if (request.preferredSources?.length) {
        const aIdx = request.preferredSources.indexOf(a.adapter.name)
        const bIdx = request.preferredSources.indexOf(b.adapter.name)
        if (aIdx !== -1 && bIdx === -1) return -1
        if (bIdx !== -1 && aIdx === -1) return 1
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
      }
      return a.adapter.priority - b.adapter.priority
    })

  if (available.length === 0) {
    adapterStates.forEach((s) => { s.disabledUntil = null; s.failureCount = 0 })
    return queryHistory(request)
  }

  for (const state of available) {
    try {
      const t0 = Date.now()
      const bars = await state.adapter.queryHistory(request)
      const latencyMs = Date.now() - t0

      state.failureCount = 0
      state.disabledUntil = null

      await recordAdapterSuccess(state.adapter.name, latencyMs).catch(() => {})

      if (bars.length < 20) {
        throw new Error(`${state.adapter.name} returned insufficient data (${bars.length} bars)`)
      }

      const filtered = applyQualityFilter(bars, request)
      return filtered
    } catch (error) {
      state.failureCount++
      const errMsg = error instanceof Error ? error.message : String(error)

      if (state.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
        state.disabledUntil = now + CIRCUIT_BREAKER_COOLDOWN_MS
      }

      await recordAdapterFailure(state.adapter.name, errMsg).catch(() => {})
    }
  }

  throw new Error(`All data sources failed for ${request.symbol}`)
}

function applyQualityFilter(bars: FxBar[], request: HistoryRequest): FxBar[] {
  let filtered = bars

  if (request.allowSynthetic === false) {
    filtered = filtered.filter((b) => !b.isSynthetic)
  }

  if (request.minQualityScore != null) {
    filtered = filtered.filter((b) => b.qualityScore >= request.minQualityScore!)
  }

  return filtered
}

async function recordAdapterSuccess(name: string, latencyMs: number) {
  await prisma.dataSourceHealth.upsert({
    where: { sourceName: name },
    create: {
      sourceName: name,
      enabled: true,
      priority: adapterStates.find((s) => s.adapter.name === name)?.adapter.priority ?? 99,
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

async function recordAdapterFailure(name: string, error: string) {
  await prisma.dataSourceHealth.upsert({
    where: { sourceName: name },
    create: {
      sourceName: name,
      enabled: true,
      priority: adapterStates.find((s) => s.adapter.name === name)?.adapter.priority ?? 99,
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
