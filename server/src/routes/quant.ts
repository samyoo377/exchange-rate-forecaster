import type { FastifyInstance } from "fastify"
import { ok, err } from "../utils/helpers.js"
import { runQuantAnalysis, getLatestQuantSignal, getQuantHistory } from "../services/quant/quantEngine.js"
import { getSourcesHealth } from "../services/quant/dataAggregator.js"
import { getQuantCronStatus, triggerQuantManually } from "../services/quant/quantCron.js"

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
