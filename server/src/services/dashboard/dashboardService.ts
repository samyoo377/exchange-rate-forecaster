import { prisma } from "../../utils/db.js"
import { computeAllIndicators, computeIndicatorSeries } from "../indicators/calculator.js"
import { computeSignals, buildPrediction } from "../prediction/engine.js"
import type { OhlcBar, PredictionOutput } from "../../types/index.js"

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

export async function getDashboard(symbol: string) {
  const bars = await getLatestBars(symbol, 60)
  if (bars.length === 0) return null

  const indicatorSeries = computeIndicatorSeries(bars)
  const latest = indicatorSeries[bars.length - 1]

  const latestPred = await prisma.predictionResult.findFirst({
    where: { symbol },
    orderBy: { createdAt: "desc" },
  })

  const series = bars.map((b, i) => ({
    tradeDate: b.tradeDate.toISOString().slice(0, 10),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    ...indicatorSeries[i],
  }))

  return {
    symbol,
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
  userQuery: string
): Promise<PredictionOutput> {
  const bars = await getLatestBars(symbol, 60)
  if (bars.length < 2) throw new Error("数据不足，无法生成预测（至少需要 2 条行情）")

  const indSeries = computeIndicatorSeries(bars)
  const ind = indSeries[bars.length - 1]
  const prevInd = indSeries[bars.length - 2]
  const signals = computeSignals(ind, prevInd)

  const latestBar = bars[bars.length - 1]
  const sourceRefs = [...new Set(bars.map((b) => b.source))]
  const snapshotVersion = latestBar.version

  const output = buildPrediction(symbol, horizon, userQuery, ind, signals, sourceRefs, snapshotVersion)

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
    },
  })

  return output
}
