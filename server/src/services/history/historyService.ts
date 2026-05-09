import { prisma } from "../../utils/db.js"
import type { PaginatedResult } from "../../types/index.js"

export async function getPredictionHistory(
  symbol: string,
  page: number,
  pageSize: number,
  direction?: string,
  horizon?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<PaginatedResult<object>> {
  const where: Record<string, unknown> = { symbol }
  if (direction && ["bullish", "bearish", "neutral"].includes(direction)) {
    where.direction = direction
  }
  if (horizon) {
    where.horizon = horizon
  }
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {}
    if (dateFrom) createdAt.gte = new Date(dateFrom)
    if (dateTo) {
      const end = new Date(dateTo)
      end.setDate(end.getDate() + 1)
      createdAt.lt = end
    }
    where.createdAt = createdAt
  }

  const [total, list] = await Promise.all([
    prisma.predictionResult.count({ where }),
    prisma.predictionResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const formatted = list.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    horizon: r.horizon,
    direction: r.direction,
    confidence: r.confidence,
    rationale: JSON.parse(r.rationale) as string[],
    riskNotes: JSON.parse(r.riskNotes) as string[],
    userQuery: r.userQuery,
    modelVersion: r.modelVersion,
    createdAt: r.createdAt.toISOString(),
  }))

  return { list: formatted, page, pageSize, total }
}

export interface PredictionStats {
  total: number
  bullish: number
  bearish: number
  neutral: number
  avgConfidence: number
  highConfidenceCount: number
  recentTrend: { date: string; bullish: number; bearish: number; neutral: number }[]
  confidenceTrend: { date: string; avg: number; count: number }[]
  horizonDistribution: { horizon: string; count: number }[]
}

export async function getPredictionStats(symbol: string, days = 30): Promise<PredictionStats> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const predictions = await prisma.predictionResult.findMany({
    where: { symbol, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: {
      direction: true,
      confidence: true,
      horizon: true,
      createdAt: true,
    },
  })

  const total = predictions.length
  const bullish = predictions.filter((p) => p.direction === "bullish").length
  const bearish = predictions.filter((p) => p.direction === "bearish").length
  const neutral = predictions.filter((p) => p.direction === "neutral").length
  const avgConfidence = total > 0
    ? predictions.reduce((sum, p) => sum + p.confidence, 0) / total
    : 0
  const highConfidenceCount = predictions.filter((p) => p.confidence >= 0.7).length

  const dailyMap = new Map<string, { bullish: number; bearish: number; neutral: number }>()
  const confMap = new Map<string, { sum: number; count: number }>()

  for (const p of predictions) {
    const date = p.createdAt.toISOString().slice(0, 10)
    const day = dailyMap.get(date) ?? { bullish: 0, bearish: 0, neutral: 0 }
    day[p.direction as "bullish" | "bearish" | "neutral"]++
    dailyMap.set(date, day)

    const conf = confMap.get(date) ?? { sum: 0, count: 0 }
    conf.sum += p.confidence
    conf.count++
    confMap.set(date, conf)
  }

  const recentTrend = [...dailyMap.entries()].map(([date, counts]) => ({ date, ...counts }))
  const confidenceTrend = [...confMap.entries()].map(([date, { sum, count }]) => ({
    date,
    avg: sum / count,
    count,
  }))

  const horizonMap = new Map<string, number>()
  for (const p of predictions) {
    horizonMap.set(p.horizon, (horizonMap.get(p.horizon) ?? 0) + 1)
  }
  const horizonDistribution = [...horizonMap.entries()].map(([horizon, count]) => ({ horizon, count }))

  return {
    total,
    bullish,
    bearish,
    neutral,
    avgConfidence,
    highConfidenceCount,
    recentTrend,
    confidenceTrend,
    horizonDistribution,
  }
}

export async function getTaskHistory(
  taskType: string | undefined,
  page: number,
  pageSize: number
): Promise<PaginatedResult<object>> {
  const where = taskType ? { taskType } : {}
  const [total, list] = await Promise.all([
    prisma.taskRunLog.count({ where }),
    prisma.taskRunLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const formatted = list.map((r) => ({
    id: r.id,
    taskType: r.taskType,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    errorMessage: r.errorMessage ?? null,
    createdAt: r.createdAt.toISOString(),
  }))

  return { list: formatted, page, pageSize, total }
}
