import { prisma } from "../../utils/db.js"
import { queryHistory } from "./fxDataSourceRegistry.js"
import { computeEnhancedCompositeScore } from "./enhancedCompositeScorer.js"
import type { HistoryRequest, FxBar, CompositeScoreResult, QuantBundle } from "./fxTypes.js"

export async function runEnhancedQuantAnalysis(
  symbol = "USDCNH",
  options?: { days?: number; interval?: "1h" | "4h" | "1d" },
): Promise<CompositeScoreResult> {
  const request: HistoryRequest = {
    symbol,
    interval: options?.interval ?? "1d",
    limit: options?.days ?? 120,
    allowSynthetic: true,
    minQualityScore: 0.2,
  }

  const bars = await queryHistory(request)
  const result = computeEnhancedCompositeScore(bars, { interval: request.interval })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  await prisma.quantSignalSnapshot.upsert({
    where: { symbol_snapshotDate: { symbol, snapshotDate: today } },
    create: {
      symbol,
      snapshotDate: today,
      compositeScore: result.compositeScore,
      regime: result.regime,
      confidence: result.confidence,
      signals: JSON.stringify(result.signals),
      metadata: JSON.stringify({
        barsUsed: bars.length,
        source: bars[0]?.source,
        datasetVersion: result.datasetVersion,
        dataQuality: result.dataQuality,
        strategyCount: result.signals.length,
        computedAt: result.timestamp.toISOString(),
      }),
    },
    update: {
      compositeScore: result.compositeScore,
      regime: result.regime,
      confidence: result.confidence,
      signals: JSON.stringify(result.signals),
      metadata: JSON.stringify({
        barsUsed: bars.length,
        source: bars[0]?.source,
        datasetVersion: result.datasetVersion,
        dataQuality: result.dataQuality,
        strategyCount: result.signals.length,
        computedAt: result.timestamp.toISOString(),
      }),
    },
  })

  return result
}

export async function buildQuantBundle(
  symbol = "USDCNH",
  horizon = "T+1",
): Promise<QuantBundle | null> {
  const request: HistoryRequest = {
    symbol,
    interval: "1d",
    limit: 120,
    allowSynthetic: true,
    minQualityScore: 0.2,
  }

  let bars: FxBar[]
  try {
    bars = await queryHistory(request)
  } catch {
    return null
  }

  if (bars.length < 20) return null

  const result = computeEnhancedCompositeScore(bars)

  const topSignals = [...result.signals]
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 5)

  return {
    symbol,
    horizon,
    latestBar: bars[bars.length - 1],
    regime: result.regime,
    compositeScore: result.compositeScore,
    confidence: result.confidence,
    topSignals,
    riskExposure: result.riskExposure,
    dataQuality: result.dataQuality,
    datasetVersion: result.datasetVersion,
    timestamp: result.timestamp,
  }
}
