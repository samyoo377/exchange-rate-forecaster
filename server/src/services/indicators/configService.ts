import { prisma } from "../../utils/db.js"
import type { IndicatorConfig } from "@prisma/client"

let cache: Map<string, IndicatorConfig> | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 60_000

export async function getIndicatorConfigs(): Promise<Map<string, IndicatorConfig>> {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache

  const rows = await prisma.indicatorConfig.findMany({ where: { enabled: true } })
  cache = new Map(rows.map((r) => [r.indicatorType, r]))
  cacheLoadedAt = Date.now()
  return cache
}

export async function getIndicatorConfig(type: string): Promise<IndicatorConfig | null> {
  const configs = await getIndicatorConfigs()
  return configs.get(type) ?? null
}

export function invalidateConfigCache() {
  cache = null
}

export interface IndicatorParams {
  RSI: { period: number }
  STOCH: { period: number; smoothK: number }
  CCI: { period: number }
  ADX: { period: number }
  AO: { shortPeriod: number; longPeriod: number }
  MOM: { period: number }
}

export interface SignalThresholds {
  RSI: { buyBelow: number; sellAbove: number }
  STOCH: { buyBelow: number; sellAbove: number }
  CCI: { buyBelow: number; sellAbove: number }
  ADX: { strongTrendAbove: number; weakTrendBelow: number; bullishMultiplier: number; bearishMultiplier: number }
  AO: { zeroCross: boolean }
  MOM: { zeroCross: boolean }
}

export async function getTypedParams<K extends keyof IndicatorParams>(type: K): Promise<IndicatorParams[K]> {
  const config = await getIndicatorConfig(type)
  if (!config) throw new Error(`Indicator config not found: ${type}`)
  return JSON.parse(config.params) as IndicatorParams[K]
}

export async function getTypedThresholds<K extends keyof SignalThresholds>(type: K): Promise<SignalThresholds[K]> {
  const config = await getIndicatorConfig(type)
  if (!config) throw new Error(`Indicator config not found: ${type}`)
  return JSON.parse(config.signalThresholds) as SignalThresholds[K]
}
