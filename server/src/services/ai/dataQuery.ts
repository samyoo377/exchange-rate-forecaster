import { prisma } from "../../utils/db.js"

export interface DataQueryResult {
  type: string
  data: unknown
  description: string
}

const MAX_ROWS = 50

export async function executeDataQuery(
  queryType: string,
  params: Record<string, unknown>,
): Promise<DataQueryResult> {
  switch (queryType) {
    case "recent_bars":
      return queryRecentBars(params)
    case "prediction_history":
      return queryPredictionHistory(params)
    case "indicator_values":
      return queryIndicatorValues(params)
    case "news_digests":
      return queryNewsDigests(params)
    case "market_stats":
      return queryMarketStats(params)
    default:
      return { type: "error", data: null, description: `未知查询类型: ${queryType}` }
  }
}

async function queryRecentBars(params: Record<string, unknown>): Promise<DataQueryResult> {
  const symbol = String(params.symbol ?? "USDCNH")
  const limit = Math.min(Number(params.limit) || 30, MAX_ROWS)

  const bars = await prisma.normalizedMarketSnapshot.findMany({
    where: { symbol },
    orderBy: { snapshotDate: "desc" },
    take: limit,
    select: {
      snapshotDate: true,
      open: true,
      high: true,
      low: true,
      close: true,
      volume: true,
    },
  })

  return {
    type: "recent_bars",
    data: bars.reverse(),
    description: `最近 ${bars.length} 条 ${symbol} K线数据`,
  }
}

async function queryPredictionHistory(params: Record<string, unknown>): Promise<DataQueryResult> {
  const symbol = String(params.symbol ?? "USDCNH")
  const limit = Math.min(Number(params.limit) || 20, MAX_ROWS)
  const direction = params.direction as string | undefined

  const where: Record<string, unknown> = { symbol }
  if (direction && ["bullish", "bearish", "neutral"].includes(direction)) {
    where.direction = direction
  }

  const predictions = await prisma.predictionResult.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      createdAt: true,
      direction: true,
      confidence: true,
      horizon: true,
      userQuery: true,
      rationale: true,
    },
  })

  return {
    type: "prediction_history",
    data: predictions,
    description: `最近 ${predictions.length} 条预测记录${direction ? ` (方向: ${direction})` : ""}`,
  }
}

async function queryIndicatorValues(params: Record<string, unknown>): Promise<DataQueryResult> {
  const symbol = String(params.symbol ?? "USDCNH")
  const limit = Math.min(Number(params.limit) || 10, MAX_ROWS)

  const bars = await prisma.normalizedMarketSnapshot.findMany({
    where: { symbol },
    orderBy: { snapshotDate: "desc" },
    take: limit,
    select: {
      snapshotDate: true,
      close: true,
    },
  })

  return {
    type: "indicator_values",
    data: bars.reverse(),
    description: `最近 ${bars.length} 条指标数据`,
  }
}

async function queryNewsDigests(params: Record<string, unknown>): Promise<DataQueryResult> {
  const symbol = String(params.symbol ?? "USDCNH")
  const limit = Math.min(Number(params.limit) || 5, 10)

  const digests = await prisma.newsDigest.findMany({
    where: { symbol },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      createdAt: true,
      headline: true,
      summary: true,
      sentiment: true,
      keyFactors: true,
    },
  })

  return {
    type: "news_digests",
    data: digests,
    description: `最近 ${digests.length} 条新闻摘要`,
  }
}

async function queryMarketStats(params: Record<string, unknown>): Promise<DataQueryResult> {
  const symbol = String(params.symbol ?? "USDCNH")
  const days = Math.min(Number(params.days) || 30, 90)

  const bars = await prisma.normalizedMarketSnapshot.findMany({
    where: { symbol },
    orderBy: { snapshotDate: "desc" },
    take: days,
    select: { close: true, high: true, low: true },
  })

  if (bars.length === 0) {
    return { type: "market_stats", data: null, description: "无数据" }
  }

  const closes = bars.map((b) => Number(b.close))
  const highs = bars.map((b) => Number(b.high))
  const lows = bars.map((b) => Number(b.low))

  const stats = {
    period: `${bars.length}日`,
    latest: closes[0],
    highest: Math.max(...highs),
    lowest: Math.min(...lows),
    average: closes.reduce((a, b) => a + b, 0) / closes.length,
    change: closes[0] - closes[closes.length - 1],
    changePercent: ((closes[0] - closes[closes.length - 1]) / closes[closes.length - 1]) * 100,
  }

  return {
    type: "market_stats",
    data: stats,
    description: `${symbol} ${bars.length}日统计数据`,
  }
}

export const AVAILABLE_QUERIES = [
  {
    name: "recent_bars",
    description: "查询最近的K线行情数据（开高低收）",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "交易对，默认USDCNH" },
        limit: { type: "number", description: "返回条数，最多50，默认30" },
      },
    },
  },
  {
    name: "prediction_history",
    description: "查询历史预测记录",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "交易对，默认USDCNH" },
        limit: { type: "number", description: "返回条数，最多50，默认20" },
        direction: { type: "string", enum: ["bullish", "bearish", "neutral"], description: "筛选方向" },
      },
    },
  },
  {
    name: "indicator_values",
    description: "查询技术指标历史值（RSI、MACD等）",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "交易对，默认USDCNH" },
        limit: { type: "number", description: "返回条数，最多50，默认10" },
      },
    },
  },
  {
    name: "news_digests",
    description: "查询历史新闻摘要",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "交易对，默认USDCNH" },
        limit: { type: "number", description: "返回条数，最多10，默认5" },
      },
    },
  },
  {
    name: "market_stats",
    description: "查询市场统计数据（最高、最低、均值、涨跌幅）",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "交易对，默认USDCNH" },
        days: { type: "number", description: "统计天数，最多90，默认30" },
      },
    },
  },
]
