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
    case "quant_signals":
      return queryQuantSignals(params)
    case "quant_bundle":
      return queryQuantBundle(params)
    case "data_source_health":
      return queryDataSourceHealth()
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

async function queryQuantSignals(params: Record<string, unknown>): Promise<DataQueryResult> {
  const symbol = String(params.symbol ?? "USDCNH")
  const limit = Math.min(Number(params.limit) || 10, 30)

  const signals = await prisma.quantSignalSnapshot.findMany({
    where: { symbol },
    orderBy: { snapshotDate: "desc" },
    take: limit,
    select: {
      snapshotDate: true,
      compositeScore: true,
      regime: true,
      confidence: true,
      signals: true,
      metadata: true,
    },
  })

  return {
    type: "quant_signals",
    data: signals.map((s) => ({
      ...s,
      signals: typeof s.signals === "string" ? JSON.parse(s.signals) : s.signals,
      metadata: typeof s.metadata === "string" ? JSON.parse(s.metadata) : s.metadata,
    })),
    description: `最近 ${signals.length} 条量化信号快照`,
  }
}

async function queryQuantBundle(params: Record<string, unknown>): Promise<DataQueryResult> {
  const symbol = String(params.symbol ?? "USDCNH")
  const horizon = String(params.horizon ?? "T+1")

  const { buildQuantBundle } = await import("../quant/enhancedQuantEngine.js")
  const bundle = await buildQuantBundle(symbol, horizon)

  if (!bundle) {
    return { type: "quant_bundle", data: null, description: "无法构建量化分析包，数据不足" }
  }

  return {
    type: "quant_bundle",
    data: {
      symbol: bundle.symbol,
      horizon: bundle.horizon,
      compositeScore: bundle.compositeScore,
      confidence: bundle.confidence,
      regime: bundle.regime,
      latestClose: bundle.latestBar.close,
      latestDate: bundle.latestBar.timestamp,
      dataQuality: bundle.dataQuality,
      topSignals: bundle.topSignals.map((s) => ({
        strategy: s.strategyKey,
        score: s.score,
        direction: s.direction,
        confidence: s.confidence,
        rationale: s.rationale[0],
      })),
    },
    description: `${symbol} 增强量化分析包 (${bundle.topSignals.length}个策略信号)`,
  }
}

async function queryDataSourceHealth(): Promise<DataQueryResult> {
  const health = await prisma.dataSourceHealth.findMany({
    select: {
      sourceName: true,
      enabled: true,
      priority: true,
      successCount: true,
      failureCount: true,
      lastSuccessAt: true,
      lastFailureAt: true,
      lastError: true,
      avgLatencyMs: true,
    },
  })

  return {
    type: "data_source_health",
    data: health,
    description: `${health.length} 个数据源健康状态`,
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
  {
    name: "quant_signals",
    description: "查询量化引擎历史信号快照（综合评分、市场状态、各策略得分）",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "交易对，默认USDCNH" },
        limit: { type: "number", description: "返回条数，最多30，默认10" },
      },
    },
  },
  {
    name: "quant_bundle",
    description: "实时触发增强量化分析，获取7大策略的最新信号、综合评分、数据质量评估。当用户询问当前量化分析或策略信号时使用。",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "交易对，默认USDCNH" },
        horizon: { type: "string", description: "预测周期，如T+1、T+3、T+7，默认T+1" },
      },
    },
  },
  {
    name: "data_source_health",
    description: "查询数据源健康状态（成功率、延迟、最近错误）",
    parameters: {
      type: "object",
      properties: {},
    },
  },
]
