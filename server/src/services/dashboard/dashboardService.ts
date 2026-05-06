import { prisma } from "../../utils/db.js"
import { computeIndicatorSeriesFromConfig } from "../indicators/calculator.js"
import { computeSignalsFromConfig, buildPredictionFromConfig } from "../prediction/engine.js"
import type { OhlcBar, PredictionOutput } from "../../types/index.js"

export type Interval = "1h" | "4h" | "1d"

export async function getLatestBars(symbol: string, limit = 60): Promise<OhlcBar[]> {
  const rows = await prisma.normalizedMarketSnapshot.findMany({
    where: { symbol },
    orderBy: { snapshotDate: "desc" },
    take: limit,
  })
  return rows
    .reverse()
    .map((r) => ({
      symbol: r.symbol,
      tradeDate: r.snapshotDate,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume ?? undefined,
      source: r.source,
      version: r.version,
    }))
}

function getBucketKey(date: Date, interval: Interval): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  const h = date.getHours()

  if (interval === "1d") return `${y}-${m}-${d}`
  if (interval === "4h") {
    const bucket = Math.floor(h / 4) * 4
    return `${y}-${m}-${d}T${String(bucket).padStart(2, "0")}:00`
  }
  return `${y}-${m}-${d}T${String(h).padStart(2, "0")}:00`
}

function aggregateBars(rawBars: OhlcBar[], interval: Interval): OhlcBar[] {
  if (interval === "1h" && rawBars.length > 0) {
    const diff = rawBars.length > 1
      ? rawBars[1].tradeDate.getTime() - rawBars[0].tradeDate.getTime()
      : 0
    if (diff >= 3600_000) return rawBars
  }

  const buckets = new Map<string, OhlcBar[]>()
  for (const bar of rawBars) {
    const key = getBucketKey(bar.tradeDate, interval)
    const arr = buckets.get(key)
    if (arr) arr.push(bar)
    else buckets.set(key, [bar])
  }

  const result: OhlcBar[] = []
  for (const [, group] of buckets) {
    const first = group[0]
    const last = group[group.length - 1]
    result.push({
      symbol: first.symbol,
      tradeDate: first.tradeDate,
      open: first.open,
      high: Math.max(...group.map((b) => b.high)),
      low: Math.min(...group.map((b) => b.low)),
      close: last.close,
      volume: group.reduce((s, b) => s + (b.volume ?? 0), 0) || undefined,
      source: first.source,
      version: first.version,
    })
  }
  return result
}

export async function getAggregatedBars(
  symbol: string,
  interval: Interval = "1d",
  limit = 120,
): Promise<OhlcBar[]> {
  const rows = await prisma.normalizedMarketSnapshot.findMany({
    where: { symbol },
    orderBy: { snapshotDate: "desc" },
    take: 6000,
    distinct: ["snapshotDate"],
  })
  const rawBars: OhlcBar[] = rows.reverse().map((r) => ({
    symbol: r.symbol,
    tradeDate: r.snapshotDate,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume ?? undefined,
    source: r.source,
    version: r.version,
  }))

  const aggregated = aggregateBars(rawBars, interval)
  return aggregated.slice(-limit)
}

function formatTradeDate(date: Date, interval: Interval): string {
  if (interval === "1d") return date.toISOString().slice(0, 10)
  return date.toISOString().slice(0, 16).replace("T", " ")
}

export async function getDashboard(symbol: string, interval: Interval = "1d") {
  const limit = interval === "1d" ? 60 : interval === "4h" ? 90 : 120
  const bars = await getAggregatedBars(symbol, interval, limit)
  if (bars.length === 0) return null

  const indicatorSeries = await computeIndicatorSeriesFromConfig(bars)
  const latest = indicatorSeries[bars.length - 1]

  const latestPred = await prisma.predictionResult.findFirst({
    where: { symbol },
    orderBy: { createdAt: "desc" },
  })

  const series = bars.map((b, i) => ({
    tradeDate: formatTradeDate(b.tradeDate, interval),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    ...indicatorSeries[i],
  }))

  return {
    symbol,
    interval,
    lastUpdatedAt: bars[bars.length - 1].tradeDate.toISOString(),
    series,
    indicators: latest,
    latestPrediction: latestPred
      ? {
          direction: latestPred.direction,
          confidence: latestPred.confidence,
          horizon: latestPred.horizon,
        }
      : null,
  }
}

export async function runPrediction(
  symbol: string,
  horizon: string,
  userQuery: string,
): Promise<PredictionOutput> {
  const bars = await getLatestBars(symbol, 60)
  if (bars.length < 2) throw new Error("数据不足，无法生成预测（至少需要 2 条行情）")

  const indSeries = await computeIndicatorSeriesFromConfig(bars)
  const ind = indSeries[bars.length - 1]
  const prevInd = indSeries[bars.length - 2]
  const signals = await computeSignalsFromConfig(ind, prevInd)

  const latestBar = bars[bars.length - 1]
  const sourceRefs = [...new Set(bars.map((b) => b.source))]
  const snapshotVersion = latestBar.version

  const output = await buildPredictionFromConfig(symbol, horizon, userQuery, ind, signals, sourceRefs, snapshotVersion)

  await prisma.predictionResult.create({
    data: {
      symbol,
      userQuery,
      horizon,
      direction: output.direction,
      confidence: output.confidence,
      rationale: JSON.stringify(output.rationale),
      riskNotes: JSON.stringify(output.riskNotes),
      modelVersion: "rule-engine-v1",
      dataSnapshotRefs: JSON.stringify(sourceRefs),
      signalsSnapshot: JSON.stringify(signals),
      indicatorsSnapshot: JSON.stringify(ind),
    },
  })

  return output
}
