import type { FastifyInstance } from "fastify"
import { ok, err } from "../utils/helpers.js"
import { runQuantAnalysis, getLatestQuantSignal, getQuantHistory } from "../services/quant/quantEngine.js"
import { runEnhancedQuantAnalysis, buildQuantBundle } from "../services/quant/enhancedQuantEngine.js"
import { getSourcesHealth } from "../services/quant/dataAggregator.js"
import { getQuantCronStatus, triggerQuantManually } from "../services/quant/quantCron.js"
import { getRegisteredStrategies } from "../services/quant/strategy/index.js"
import { getRegisteredAdapters } from "../services/quant/fxDataSourceRegistry.js"

export async function registerQuantRoutes(app: FastifyInstance) {
  app.get("/api/v1/quant/latest", async (request) => {
    const query = request.query as { symbol?: string }
    const symbol = query.symbol ?? "USDCNH"

    const signal = await getLatestQuantSignal(symbol)
    if (!signal) {
      return ok(null, "暂无量化信号，请先触发计算")
    }
    return ok(signal)
  })

  app.get("/api/v1/quant/history", async (request) => {
    const query = request.query as { symbol?: string; limit?: string }
    const symbol = query.symbol ?? "USDCNH"
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "30")))

    const history = await getQuantHistory(symbol, limit)
    return ok(history)
  })

  app.post("/api/v1/quant/trigger", async (request, reply) => {
    const body = request.body as { symbol?: string } | null
    const symbol = body?.symbol ?? "USDCNH"

    try {
      const result = await runQuantAnalysis(symbol)
      return ok({
        compositeScore: result.compositeScore,
        regime: result.regime,
        confidence: result.confidence,
        signalCount: result.signals.length,
        timestamp: result.timestamp.toISOString(),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      reply.status(500)
      return err(50020, `量化分析失败: ${msg}`)
    }
  })

  app.post("/api/v1/quant/enhanced/trigger", async (request, reply) => {
    const body = request.body as { symbol?: string; interval?: string; days?: number } | null
    const symbol = body?.symbol ?? "USDCNH"
    const interval = (body?.interval ?? "1d") as "1h" | "4h" | "1d"
    const days = body?.days ?? 120

    try {
      const result = await runEnhancedQuantAnalysis(symbol, { days, interval })
      return ok({
        compositeScore: result.compositeScore,
        regime: result.regime,
        confidence: result.confidence,
        signalCount: result.signals.length,
        riskExposure: result.riskExposure,
        dataQuality: result.dataQuality,
        datasetVersion: result.datasetVersion,
        timestamp: result.timestamp.toISOString(),
        signals: result.signals.map((s) => ({
          key: s.strategyKey,
          version: s.strategyVersion,
          score: s.score,
          confidence: s.confidence,
          direction: s.direction,
          rationale: s.rationale,
        })),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      reply.status(500)
      return err(50022, `增强量化分析失败: ${msg}`)
    }
  })

  app.get("/api/v1/quant/bundle", async (request) => {
    const query = request.query as { symbol?: string; horizon?: string }
    const symbol = query.symbol ?? "USDCNH"
    const horizon = query.horizon ?? "T+1"

    const bundle = await buildQuantBundle(symbol, horizon)
    if (!bundle) {
      return ok(null, "无法构建量化分析包，数据不足")
    }
    return ok(bundle)
  })

  app.get("/api/v1/quant/strategies", async () => {
    const strategies = getRegisteredStrategies()
    return ok(strategies.map((s) => ({
      key: s.key,
      displayName: s.displayName,
      version: s.version,
      supportedIntervals: s.supportedIntervals,
      supportsSynthetic: s.supportsSynthetic,
      supportedRegimes: s.supportedRegimes,
    })))
  })

  app.get("/api/v1/quant/adapters", async () => {
    const adapters = getRegisteredAdapters()
    return ok(adapters.map((a) => ({
      name: a.name,
      priority: a.priority,
    })))
  })

  app.get("/api/v1/quant/sources/health", async () => {
    const health = await getSourcesHealth()
    return ok(health)
  })

  app.get("/api/v1/quant/cron/status", async () => {
    return ok(getQuantCronStatus())
  })

  app.post("/api/v1/quant/cron/trigger", async (_request, reply) => {
    try {
      const status = await triggerQuantManually()
      return ok(status)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      reply.status(500)
      return err(50021, `手动触发失败: ${msg}`)
    }
  })
}
