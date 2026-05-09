import { prisma } from "../../utils/db.js"
import { fetchBars } from "./dataAggregator.js"
import { computeCompositeScore } from "./compositeScorer.js"
import type { CompositeResult } from "./types.js"

export async function runQuantAnalysis(symbol = "USDCNH"): Promise<CompositeResult> {
  const bars = await fetchBars(symbol, 120)
  const result = computeCompositeScore(bars)

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
        computedAt: result.timestamp.toISOString(),
      }),
    },
  })

  return result
}

export async function getLatestQuantSignal(symbol = "USDCNH") {
  const snapshot = await prisma.quantSignalSnapshot.findFirst({
    where: { symbol },
    orderBy: { createdAt: "desc" },
  })

  if (!snapshot) return null

  return {
    id: snapshot.id,
    symbol: snapshot.symbol,
    snapshotDate: snapshot.snapshotDate.toISOString(),
    compositeScore: snapshot.compositeScore,
    regime: snapshot.regime,
    confidence: snapshot.confidence,
    signals: JSON.parse(snapshot.signals),
    metadata: snapshot.metadata ? JSON.parse(snapshot.metadata) : null,
    createdAt: snapshot.createdAt.toISOString(),
  }
}

export async function getQuantHistory(symbol = "USDCNH", limit = 30) {
  const snapshots = await prisma.quantSignalSnapshot.findMany({
    where: { symbol },
    orderBy: { snapshotDate: "desc" },
    take: limit,
  })

  return snapshots.map((s) => ({
    id: s.id,
    symbol: s.symbol,
    snapshotDate: s.snapshotDate.toISOString(),
    compositeScore: s.compositeScore,
    regime: s.regime,
    confidence: s.confidence,
    signals: JSON.parse(s.signals),
    createdAt: s.createdAt.toISOString(),
  }))
}
