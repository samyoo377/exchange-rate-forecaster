import { prisma } from "../../utils/db.js"
import type { PaginatedResult } from "../../types/index.js"

export async function getPredictionHistory(
  symbol: string,
  page: number,
  pageSize: number
): Promise<PaginatedResult<object>> {
  const [total, list] = await Promise.all([
    prisma.predictionResult.count({ where: { symbol } }),
    prisma.predictionResult.findMany({
      where: { symbol },
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
