import { prisma } from "../../utils/db.js"
import { computeIndicatorSeriesFromConfig } from "../indicators/calculator.js"
import { computeSignalsFromConfig } from "../prediction/engine.js"
import { computeUnifiedPrediction } from "../prediction/unifiedScorer.js"
import { generateAiAnalysis } from "../prediction/aiAnalyzer.js"
import { computeAtr } from "../quant/algorithms/volatilityRegime.js"
import { fetchFromAlphaVantage } from "../quant/sources/alphaVantageSource.js"
import { upsertSnapshots } from "../market-data/alphaProvider.js"
import { genVersion } from "../../utils/helpers.js"
import type { OhlcBar, PredictionOutput } from "../../types/index.js"
import type { QuantBar } from "../quant/types.js"

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

const STALE_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000

async function ensureFreshData(symbol: string): Promise<void> {
  const latestReal = await prisma.normalizedMarketSnapshot.findFirst({
    where: { symbol, source: { in: ["excel", "alpha_vantage", "yahoo_finance"] } },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  })

  const isStale = !latestReal || (Date.now() - latestReal.snapshotDate.getTime() > STALE_THRESHOLD_MS)
  if (!isStale) return

  try {
    const quantBars = await fetchFromAlphaVantage(symbol, 120)
    const version = genVersion(symbol)
    const ohlcBars: OhlcBar[] = quantBars.map((b) => ({
      symbol,
      tradeDate: b.date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      source: "alpha_vantage",
      version,
    }))
    await upsertSnapshots(ohlcBars)
  } catch {
    // fallback to existing data if refresh fails
  }
}

export async function getAggregatedBars(
  symbol: string,
  interval: Interval = "1d",
  limit = 120,
): Promise<OhlcBar[]> {
  await ensureFreshData(symbol)

  const barsNeeded = limit + 200
  const estimatedRowsPerBar = interval === "1d" ? 96 : interval === "4h" ? 4 : 1
  const fetchLimit = Math.min(50000, barsNeeded * estimatedRowsPerBar)

  const rows = await prisma.normalizedMarketSnapshot.findMany({
    where: { symbol },
    orderBy: { snapshotDate: "desc" },
    take: fetchLimit,
  })

  const byDate = new Map<string, typeof rows[0]>()
  const SOURCE_PRIORITY: Record<string, number> = { excel: 1, alpha_vantage: 2, yahoo_finance: 3, frankfurter: 4, ecb: 5 }

  for (const r of rows) {
    const key = r.snapshotDate.toISOString()
    const existing = byDate.get(key)
    if (!existing) {
      byDate.set(key, r)
    } else {
      const existingPri = SOURCE_PRIORITY[existing.source] ?? 5
      const newPri = SOURCE_PRIORITY[r.source] ?? 5
      if (newPri < existingPri) {
        byDate.set(key, r)
      }
    }
  }

  const deduped = [...byDate.values()].sort(
    (a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime(),
  )

  const rawBars: OhlcBar[] = deduped.map((r) => ({
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
  const displayLimit = interval === "1d" ? 60 : interval === "4h" ? 90 : 120
  const computeLimit = displayLimit + 200
  const bars = await getAggregatedBars(symbol, interval, computeLimit)
  if (bars.length === 0) return null

  const indicatorSeries = await computeIndicatorSeriesFromConfig(bars)

  const displayStart = Math.max(0, bars.length - displayLimit)
  const displayBars = bars.slice(displayStart)
  const displayIndicators = indicatorSeries.slice(displayStart)
  const latest = indicatorSeries[bars.length - 1]

  const latestPred = await prisma.predictionResult.findFirst({
    where: { symbol },
    orderBy: { createdAt: "desc" },
  })

  const series = displayBars.map((b, i) => ({
    tradeDate: formatTradeDate(b.tradeDate, interval),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    ...displayIndicators[i],
  }))

  const prev = bars.length >= 2 ? indicatorSeries[bars.length - 2] : undefined
  const signals = await computeSignalsFromConfig(latest, prev)
  const unified = await computeUnifiedPrediction(symbol, latest, signals)

  const recentPreds = await prisma.predictionResult.findMany({
    where: { symbol },
    orderBy: { createdAt: "desc" },
    take: 7,
    select: { direction: true, confidence: true, createdAt: true, quantEvidenceJson: true },
  })

  const recentHistory = recentPreds.reverse().map((p) => {
    const evidence = p.quantEvidenceJson ? JSON.parse(p.quantEvidenceJson) : null
    return {
      date: p.createdAt.toISOString(),
      direction: p.direction,
      confidence: p.confidence,
      compositeScore: evidence?.compositeScore ?? 0,
    }
  })

  const riskExposure = computeRiskExposureFromBars(displayBars)

  return {
    symbol,
    interval,
    lastUpdatedAt: displayBars[displayBars.length - 1].tradeDate.toISOString(),
    series,
    indicators: latest,
    latestPrediction: latestPred
      ? {
          direction: unified.direction,
          confidence: unified.confidence,
          horizon: latestPred.horizon,
          compositeScore: unified.compositeScore,
          generatedAt: latestPred.createdAt.toISOString(),
          breakdown: unified.breakdown,
          rationale: unified.rationale,
          dataFreshness: unified.dataFreshness,
          riskExposure,
          recentHistory,
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

  const unified = await computeUnifiedPrediction(symbol, ind, signals)

  const aiAnalysis = await generateAiAnalysis({
    symbol,
    horizon,
    direction: unified.direction,
    compositeScore: unified.compositeScore,
    indicators: ind,
    signals,
    quantScore: unified.breakdown.quant.score,
    quantRegime: unified.breakdown.quant.regime,
    newsHeadline: unified.breakdown.news.headline || null,
    newsSentiment: unified.breakdown.news.sentiment,
    newsFactors: unified.breakdown.news.topFactors,
  })

  const output: PredictionOutput = {
    symbol,
    horizon,
    direction: unified.direction,
    confidence: unified.confidence,
    rationale: aiAnalysis.rationale,
    riskNotes: aiAnalysis.riskNotes,
    sourceRefs,
    generatedAt: new Date().toISOString(),
    snapshotVersion,
  }

  await prisma.predictionResult.create({
    data: {
      symbol,
      userQuery,
      horizon,
      direction: output.direction,
      confidence: output.confidence,
      rationale: JSON.stringify(output.rationale),
      riskNotes: JSON.stringify(output.riskNotes),
      modelVersion: "unified-scorer-v1+ai",
      dataSnapshotRefs: JSON.stringify(sourceRefs),
      signalsSnapshot: JSON.stringify(signals),
      indicatorsSnapshot: JSON.stringify(ind),
      aiAnalysisContent: aiAnalysis.aiAnalysisContent ?? null,
      quantEvidenceJson: JSON.stringify({
        compositeScore: unified.compositeScore,
        breakdown: {
          technical: unified.breakdown.technical.score,
          quant: unified.breakdown.quant.score,
          news: unified.breakdown.news.score,
        },
        keyInsight: aiAnalysis.keyInsight,
      }),
    },
  })

  return output
}

function computeRiskExposureFromBars(bars: OhlcBar[]) {
  if (bars.length < 15) {
    return { atr14: 0, atr14Pct: 0, maxDrawdownBp: 0, volatilityLevel: "low" as const, riskScore: 0 }
  }

  const quantBars: QuantBar[] = bars.map((b) => ({
    date: b.tradeDate,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume ?? 0,
    source: b.source ?? "db",
  }))

  const atrSeries = computeAtr(quantBars, 14)
  const atr14 = atrSeries[atrSeries.length - 1]
  const latestClose = bars[bars.length - 1].close
  const atr14Pct = (atr14 / latestClose) * 100

  const recentBars = bars.slice(-20)
  let peak = recentBars[0].close
  let maxDd = 0
  for (const bar of recentBars) {
    if (bar.close > peak) peak = bar.close
    const dd = (peak - bar.close) / peak
    if (dd > maxDd) maxDd = dd
  }
  const maxDrawdownBp = Math.round(maxDd * 10000)

  let volatilityLevel: "low" | "medium" | "high" | "extreme"
  if (atr14Pct < 0.15) volatilityLevel = "low"
  else if (atr14Pct < 0.35) volatilityLevel = "medium"
  else if (atr14Pct < 0.60) volatilityLevel = "high"
  else volatilityLevel = "extreme"

  const riskScore = Math.min(100, Math.round(
    (atr14Pct / 0.6) * 40 + (maxDrawdownBp / 200) * 30 + (volatilityLevel === "extreme" ? 30 : volatilityLevel === "high" ? 20 : volatilityLevel === "medium" ? 10 : 0),
  ))

  return {
    atr14: Math.round(atr14 * 10000) / 10000,
    atr14Pct: Math.round(atr14Pct * 1000) / 1000,
    maxDrawdownBp,
    volatilityLevel,
    riskScore,
  }
}
