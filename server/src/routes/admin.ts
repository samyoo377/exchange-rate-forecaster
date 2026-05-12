import type { FastifyInstance } from "fastify"
import { Prisma } from "@prisma/client"
import { prisma } from "../utils/db.js"
import { ok, err } from "../utils/helpers.js"
import { getCronStatus, requestAbort, resetCronTimer } from "../services/news/index.js"
import { getPredictionCronStatus, triggerPredictionManually } from "../services/prediction/predictionCron.js"
import { fetchAllNews } from "../services/news/newsFetcher.js"
import { testFetchSource } from "../services/news/newsFetcher.js"
import { digestRecentNews } from "../services/news/newsDigester.js"
import { streamAdminChat, executeAdminQuery, getAdminModels } from "../services/ai/adminAssistant.js"
import { invalidateConfigCache } from "../services/indicators/configService.js"
import { validateFormula, evaluateFormula, validateStepFormulas } from "../services/indicators/formulaEvaluator.js"
import { getLatestBars } from "../services/dashboard/dashboardService.js"
import {
  createSession, listSessions, getSessionWithMessages,
  deleteSession, addMessage, generateSessionTitle, getSessionHistory,
  enrichMessagesWithAttachments,
} from "../services/chat/sessionService.js"

const TABLE_MAP: Record<string, any> = {
  RawMarketData: () => prisma.rawMarketData,
  NormalizedMarketSnapshot: () => prisma.normalizedMarketSnapshot,
  InsightSummary: () => prisma.insightSummary,
  PredictionResult: () => prisma.predictionResult,
  TaskRunLog: () => prisma.taskRunLog,
  NewsRawItem: () => prisma.newsRawItem,
  NewsDigest: () => prisma.newsDigest,
  NewsSource: () => prisma.newsSource,
  ChatSession: () => prisma.chatSession,
  ChatMessage: () => prisma.chatMessage,
  UploadedFile: () => prisma.uploadedFile,
  IndicatorConfig: () => prisma.indicatorConfig,
  IndicatorGroup: () => prisma.indicatorGroup,
  NewsFetchLog: () => prisma.newsFetchLog,
}

function getModelFieldTypes(modelName: string): Record<string, string> {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName)
  if (!model) return {}
  return Object.fromEntries(model.fields.map((f) => [f.name, f.type]))
}

function buildFiltersWhere(
  table: string,
  filters: Record<string, string>,
): Record<string, any> {
  const fieldTypes = getModelFieldTypes(table)
  const where: Record<string, any> = {}

  for (const [field, value] of Object.entries(filters)) {
    if (!value?.trim()) continue
    const v = value.trim()
    const type = fieldTypes[field]

    switch (type) {
      case "String":
        where[field] = { contains: v }
        break
      case "Int":
      case "Float": {
        const num = Number(v)
        if (!isNaN(num)) where[field] = num
        break
      }
      case "Boolean":
        if (["true", "1", "是", "成功"].includes(v.toLowerCase()))
          where[field] = true
        else if (["false", "0", "否", "失败"].includes(v.toLowerCase()))
          where[field] = false
        break
      case "DateTime": {
        try {
          if (/^\d{4}$/.test(v)) {
            const start = new Date(`${v}-01-01T00:00:00Z`)
            const end = new Date(`${Number(v) + 1}-01-01T00:00:00Z`)
            where[field] = { gte: start, lt: end }
          } else if (/^\d{4}-\d{2}$/.test(v)) {
            const start = new Date(`${v}-01T00:00:00Z`)
            const end = new Date(start)
            end.setMonth(end.getMonth() + 1)
            where[field] = { gte: start, lt: end }
          } else if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
            const start = new Date(v)
            if (!isNaN(start.getTime())) {
              start.setHours(0, 0, 0, 0)
              const end = new Date(start)
              end.setDate(end.getDate() + 1)
              where[field] = { gte: start, lt: end }
            }
          }
        } catch {
          // skip
        }
        break
      }
      default:
        where[field] = { contains: v }
    }
  }

  return where
}

export async function registerAdminRoutes(app: FastifyInstance) {
  // ── Cron status ──
  app.get("/api/v1/admin/cron/status", async () => {
    const newsStatus = getCronStatus()
    const predictionStatus = getPredictionCronStatus()
    return ok([...newsStatus, predictionStatus])
  })

  // ── Admin AI models ──
  app.get("/api/v1/admin/models", async () => {
    return ok(getAdminModels())
  })

  // ── Manual trigger: news fetch ──
  app.post("/api/v1/admin/cron/trigger/fetch", async () => {
    const taskLog = await prisma.taskRunLog.create({
      data: {
        taskType: "news_fetch",
        status: "running",
        startedAt: new Date(),
        inputRef: JSON.stringify({ trigger: "manual_admin" }),
      },
    }).catch(() => null)
    try {
      const result = await fetchAllNews()
      if (taskLog) {
        await prisma.taskRunLog.update({
          where: { id: taskLog.id },
          data: {
            status: "success",
            finishedAt: new Date(),
            outputRef: JSON.stringify(result),
          },
        }).catch(() => {})
      }
      resetCronTimer("news_fetch")
      return ok({ triggered: true, ...result })
    } catch (e) {
      if (taskLog) {
        await prisma.taskRunLog.update({
          where: { id: taskLog.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            errorMessage: (e as Error).message,
          },
        }).catch(() => {})
      }
      return err(500, (e as Error).message)
    }
  })

  // ── Manual trigger: news digest ──
  app.post("/api/v1/admin/cron/trigger/digest", async () => {
    const taskLog = await prisma.taskRunLog.create({
      data: {
        taskType: "news_digest",
        status: "running",
        startedAt: new Date(),
        inputRef: JSON.stringify({ trigger: "manual_admin" }),
      },
    }).catch(() => null)
    try {
      const result = await digestRecentNews()
      if (taskLog) {
        await prisma.taskRunLog.update({
          where: { id: taskLog.id },
          data: {
            status: "success",
            finishedAt: new Date(),
            outputRef: result ? JSON.stringify(result) : null,
          },
        }).catch(() => {})
      }
      resetCronTimer("news_digest")
      return ok({ triggered: true, result })
    } catch (e) {
      if (taskLog) {
        await prisma.taskRunLog.update({
          where: { id: taskLog.id },
          data: {
            status: "failed",
            finishedAt: new Date(),
            errorMessage: (e as Error).message,
          },
        }).catch(() => {})
      }
      return err(500, (e as Error).message)
    }
  })

  // ── Manual trigger: prediction ──
  app.post("/api/v1/admin/cron/trigger/prediction", async () => {
    try {
      const status = await triggerPredictionManually()
      return ok({ triggered: true, status })
    } catch (e) {
      return err(500, (e as Error).message)
    }
  })

  // ── Abort running task ──
  app.post<{ Params: { taskType: string } }>("/api/v1/admin/cron/abort/:taskType", async (req) => {
    const { taskType } = req.params
    const aborted = requestAbort(taskType)
    if (aborted) {
      const running = await prisma.taskRunLog.findFirst({
        where: { taskType, status: "running" },
        orderBy: { startedAt: "desc" },
      })
      if (running) {
        await prisma.taskRunLog.update({
          where: { id: running.id },
          data: { status: "aborted", finishedAt: new Date(), errorMessage: "用户手动中断" },
        }).catch(() => {})
      }
    }
    return ok({ aborted })
  })

  // ── Digest execution logs (enriched with digest details) ──
  app.get("/api/v1/admin/digest-logs", async (req) => {
    const query = req.query as { page?: string; pageSize?: string }
    const take = Math.min(50, parseInt(query.pageSize ?? "20"))
    const skip = (Math.max(1, parseInt(query.page ?? "1")) - 1) * take

    const [logs, total] = await Promise.all([
      prisma.taskRunLog.findMany({
        where: { taskType: "news_digest" },
        orderBy: { startedAt: "desc" },
        take,
        skip,
      }),
      prisma.taskRunLog.count({ where: { taskType: "news_digest" } }),
    ])

    const enriched = await Promise.all(
      logs.map(async (log) => {
        let digest = null
        if (log.outputRef) {
          try {
            const output = JSON.parse(log.outputRef)
            if (output.digestId) {
              const d = await prisma.newsDigest.findUnique({ where: { id: output.digestId } })
              if (d) {
                const rawItemIds: string[] = JSON.parse(d.rawItemIds)
                const rawItems = rawItemIds.length > 0
                  ? await prisma.newsRawItem.findMany({
                      where: { id: { in: rawItemIds.slice(0, 50) } },
                      orderBy: { fetchedAt: "desc" },
                      select: { id: true, source: true, title: true, url: true, summary: true, publishedAt: true, category: true },
                    })
                  : []
                digest = {
                  id: d.id,
                  headline: d.headline,
                  summary: d.summary,
                  sentiment: d.sentiment,
                  keyFactors: JSON.parse(d.keyFactors),
                  modelVersion: d.modelVersion,
                  rawItems,
                  rawItemCount: rawItemIds.length,
                }
              }
            }
          } catch {}
        }
        return {
          id: log.id,
          status: log.status,
          startedAt: log.startedAt,
          finishedAt: log.finishedAt,
          errorMessage: log.errorMessage,
          inputRef: log.inputRef,
          durationMs: log.finishedAt
            ? log.finishedAt.getTime() - log.startedAt.getTime()
            : null,
          digest,
        }
      }),
    )

    return ok({ rows: enriched, total, take, skip })
  })

  // ── Table list with counts ──
  app.get("/api/v1/admin/tables", async () => {
    const result: { name: string; count: number }[] = []
    for (const [name, getModel] of Object.entries(TABLE_MAP)) {
      try {
        const count = await getModel().count()
        result.push({ name, count })
      } catch {
        result.push({ name, count: -1 })
      }
    }
    return ok(result)
  })

  // ── Table schema (field names + types) ──
  app.get<{ Params: { table: string } }>(
    "/api/v1/admin/tables/:table/schema",
    async (req) => {
      const { table } = req.params
      const getModel = TABLE_MAP[table]
      if (!getModel) return err(404, `Unknown table: ${table}`)

      const fieldTypes = getModelFieldTypes(table)
      const model = Prisma.dmmf.datamodel.models.find((m) => m.name === table)
      const enumValues: Record<string, string[]> = {}

      if (model) {
        for (const f of model.fields) {
          if (f.documentation?.startsWith("enum:")) {
            enumValues[f.name] = f.documentation.slice(5).split(",").map((s) => s.trim())
          }
        }
      }

      try {
        const sample = await getModel().findFirst()
        const fields = sample ? Object.keys(sample) : (model ? model.fields.filter((f) => f.kind === "scalar").map((f) => f.name) : [])
        return ok({ table, fields, fieldTypes, enumValues })
      } catch {
        const fields = model ? model.fields.filter((f) => f.kind === "scalar").map((f) => f.name) : []
        return ok({ table, fields, fieldTypes, enumValues })
      }
    }
  )

  // ── Distinct values for a field (for enum dropdowns) ──
  app.get<{ Params: { table: string; field: string } }>(
    "/api/v1/admin/tables/:table/distinct/:field",
    async (req) => {
      const { table, field } = req.params
      const getModel = TABLE_MAP[table]
      if (!getModel) return err(404, `Unknown table: ${table}`)

      try {
        const rows = await getModel().findMany({
          select: { [field]: true },
          distinct: [field],
          take: 100,
        })
        const values = [...new Set(rows.map((r: any) => r[field]).filter((v: any) => v != null))]
        return ok(values)
      } catch {
        return ok([])
      }
    }
  )

  // ── Generic table query ──
  app.post<{ Params: { table: string } }>(
    "/api/v1/admin/tables/:table/query",
    async (req) => {
      const { table } = req.params
      const getModel = TABLE_MAP[table]
      if (!getModel) return err(404, `Unknown table: ${table}`)

      const body = req.body as {
        where?: Record<string, any>
        filters?: Record<string, string>
        orderBy?: Record<string, string>
        take?: number
        skip?: number
      }

      const take = Math.min(body.take ?? 20, 200)
      const skip = body.skip ?? 0

      let where = body.where
      if (body.filters && Object.keys(body.filters).length > 0) {
        where = buildFiltersWhere(table, body.filters)
      }

      try {
        const [rows, total] = await Promise.all([
          getModel().findMany({
            where,
            orderBy: body.orderBy,
            take,
            skip,
          }),
          getModel().count({ where }),
        ])
        return ok({ rows, total, take, skip })
      } catch (e) {
        const msg = (e as Error).message
        if (msg.includes("contains") && where) {
          const fallbackWhere: Record<string, any> = {}
          for (const [key, val] of Object.entries(where)) {
            if (val && typeof val === "object" && "contains" in val) {
              const str = String(val.contains)
              const num = Number(str)
              if (!isNaN(num) && str !== "") {
                fallbackWhere[key] = num
              } else if (str === "true") {
                fallbackWhere[key] = true
              } else if (str === "false") {
                fallbackWhere[key] = false
              }
            } else {
              fallbackWhere[key] = val
            }
          }
          try {
            const [rows, total] = await Promise.all([
              getModel().findMany({ where: fallbackWhere, orderBy: body.orderBy, take, skip }),
              getModel().count({ where: fallbackWhere }),
            ])
            return ok({ rows, total, take, skip })
          } catch {
            // fall through
          }
        }
        return err(500, msg)
      }
    }
  )

  // ── Admin AI chat (SSE stream) with session persistence ──
  app.post("/api/v1/admin/chat/stream", async (req, reply) => {
    const { message, sessionId: inputSessionId, history, model, attachmentIds, pageContext } = req.body as {
      message: string
      sessionId?: string
      history?: { role: "user" | "assistant"; content: string }[]
      model?: string
      attachmentIds?: string[]
      pageContext?: { pageName: string; pageData?: string }
    }

    if (!message) return err(400, "message is required")

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })

    try {
      let sessionId = inputSessionId
      let isNewSession = false

      if (sessionId) {
        const existing = await getSessionWithMessages(sessionId)
        if (!existing) sessionId = undefined
      }

      if (!sessionId) {
        const session = await createSession("admin")
        sessionId = session.id
        isNewSession = true
        reply.raw.write(`data: ${JSON.stringify({ sessionId })}\n\n`)
      }

      await addMessage(sessionId, "user", message, attachmentIds)

      if (isNewSession) {
        await generateSessionTitle(sessionId, message)
      }

      let chatHistory: { role: "user" | "assistant"; content: string }[]
      if (inputSessionId) {
        const dbHistory = await getSessionHistory(sessionId)
        chatHistory = dbHistory
          .slice(0, -1)
          .filter((m): m is { role: "user" | "assistant"; content: string } =>
            m.role === "user" || m.role === "assistant")
          .slice(-20)
      } else {
        chatHistory = history ?? []
      }

      let fullResponse = ""
      for await (const chunk of streamAdminChat(message, chatHistory, model, attachmentIds ?? [], pageContext)) {
        reply.raw.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
        fullResponse += chunk
      }

      await addMessage(sessionId, "assistant", fullResponse)

      reply.raw.write("data: [DONE]\n\n")
    } catch (e) {
      reply.raw.write(
        `data: ${JSON.stringify({ error: (e as Error).message })}\n\n`
      )
    }

    reply.raw.end()
  })

  // ── Admin Chat Session CRUD ──
  app.get("/api/v1/admin/chat/sessions", async (req) => {
    const query = req.query as { limit?: string }
    const limit = Math.min(100, parseInt(query.limit ?? "50"))
    const sessions = await listSessions("admin", limit)
    return ok(sessions)
  })

  app.get<{ Params: { id: string } }>("/api/v1/admin/chat/sessions/:id", async (req, reply) => {
    const session = await getSessionWithMessages(req.params.id)
    if (!session) {
      reply.status(404)
      return err(40401, "会话不存在")
    }
    const enrichedMessages = await enrichMessagesWithAttachments(session.messages)
    return ok({ ...session, messages: enrichedMessages })
  })

  app.delete<{ Params: { id: string } }>("/api/v1/admin/chat/sessions/:id", async (req, reply) => {
    try {
      await deleteSession(req.params.id)
      return ok({ deleted: true })
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  // ── News Source CRUD ──
  app.get("/api/v1/admin/news-sources", async () => {
    const sources = await prisma.newsSource.findMany({ orderBy: { createdAt: "asc" } })
    return ok(sources)
  })

  // ── News Fetch Logs ──
  app.get("/api/v1/admin/news-fetch-logs", async (req) => {
    const query = req.query as { sourceId?: string; page?: string; pageSize?: string }
    const take = Math.min(200, parseInt(query.pageSize ?? "50"))
    const skip = (Math.max(1, parseInt(query.page ?? "1")) - 1) * take
    const where = query.sourceId ? { sourceId: query.sourceId } : {}

    const [rows, total] = await Promise.all([
      prisma.newsFetchLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.newsFetchLog.count({ where }),
    ])
    return ok({ rows, total, take, skip })
  })

  app.post("/api/v1/admin/news-sources", async (req, reply) => {
    const body = req.body as {
      name: string; url: string; type: string; category: string
      enabled?: boolean; fetchIntervalMs?: number
    }
    if (!body.name || !body.url || !body.type || !body.category) {
      reply.status(400)
      return err(400, "name, url, type, category are required")
    }
    try {
      const source = await prisma.newsSource.create({ data: {
        name: body.name,
        url: body.url,
        type: body.type,
        category: body.category,
        enabled: body.enabled ?? true,
        fetchIntervalMs: body.fetchIntervalMs ?? 60000,
      }})
      return ok(source)
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  app.put<{ Params: { id: string } }>("/api/v1/admin/news-sources/:id", async (req, reply) => {
    const { id } = req.params
    const body = req.body as Partial<{
      name: string; url: string; type: string; category: string
      enabled: boolean; fetchIntervalMs: number
    }>
    try {
      const source = await prisma.newsSource.update({ where: { id }, data: body })
      return ok(source)
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  app.delete<{ Params: { id: string } }>("/api/v1/admin/news-sources/:id", async (req, reply) => {
    const { id } = req.params
    try {
      await prisma.newsSource.delete({ where: { id } })
      return ok({ deleted: true })
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  app.post<{ Params: { id: string } }>("/api/v1/admin/news-sources/:id/test", async (req, reply) => {
    try {
      const result = await testFetchSource(req.params.id)
      return ok(result)
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  // ── FinBERT 情感分析 ──
  app.get("/api/v1/admin/finbert/status", async () => {
    const { isFinBertAvailable } = await import("../services/ai/finbertAnalyzer.js")
    const available = await isFinBertAvailable()
    return ok({ available })
  })

  app.post("/api/v1/admin/finbert/analyze", async (req, reply) => {
    const { analyzeWithFinBert, isFinBertAvailable } = await import("../services/ai/finbertAnalyzer.js")
    const available = await isFinBertAvailable()
    if (!available) {
      reply.status(503)
      return err(503, "FinBERT 服务未启动。请运行: python server/scripts/finbert_service.py")
    }

    const body = req.body as { texts?: string[] }
    if (!body.texts?.length) {
      const recentNews = await prisma.newsRawItem.findMany({
        where: { fetchedAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) } },
        orderBy: { fetchedAt: "desc" },
        take: 30,
      })
      if (recentNews.length === 0) {
        reply.status(404)
        return err(404, "无最近新闻可分析")
      }
      body.texts = recentNews.map((n) => n.summary ? `${n.title}. ${n.summary.slice(0, 150)}` : n.title)
    }

    const result = await analyzeWithFinBert(body.texts)
    return ok(result)
  })

  // ── OHLC market data for admin charts ──
  app.get("/api/v1/admin/market-data/ohlc", async (req) => {
    const query = req.query as { symbol?: string; limit?: string }
    const symbol = query.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"
    const limit = Math.min(200, Math.max(10, parseInt(query.limit ?? "60")))
    let bars = await getLatestBars(symbol, limit)

    const isStale = bars.length === 0 || (Date.now() - bars[bars.length - 1].tradeDate.getTime() > 2 * 24 * 60 * 60_000)

    if (isStale) {
      try {
        const { fetchBars } = await import("../services/quant/dataAggregator.js")
        const { upsertSnapshots } = await import("../services/market-data/alphaProvider.js")
        const freshBars = await fetchBars(symbol, 120)
        const ohlcBars = freshBars.map((b: any) => ({
          symbol,
          tradeDate: b.date,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume,
          source: b.source ?? "yahoo_finance",
          version: `auto-refresh-${new Date().toISOString().slice(0, 10)}`,
        }))
        await upsertSnapshots(ohlcBars)
        bars = await getLatestBars(symbol, limit)
      } catch {
        // fallback to existing data
      }
    }

    if (bars.length >= 5) {
      return ok({
        bars: bars.map((b) => ({
          tradeDate: b.tradeDate.toISOString().slice(0, 10),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume ?? null,
        })),
      })
    }

    try {
      const { fetchRateTrend, aggregateDailyRates } = await import("../services/market-data/rateFetcher.js")
      const trend = await fetchRateTrend("M")
      const daily = aggregateDailyRates(trend.data)
      return ok({
        bars: daily.slice(-limit).map((d) => ({
          tradeDate: d.date,
          open: d.rate,
          high: d.rate,
          low: d.rate,
          close: d.rate,
          volume: null,
        })),
      })
    } catch {
      return ok({
        bars: bars.map((b) => ({
          tradeDate: b.tradeDate.toISOString().slice(0, 10),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume ?? null,
        })),
      })
    }
  })

  // ── Rate trend data (daily aggregated from external API) ──
  app.get("/api/v1/admin/market-data/rate-trend", async (req) => {
    const query = req.query as { days?: string; queryType?: string; granularity?: string }
    const days = Math.min(90, Math.max(7, parseInt(query.days ?? "30")))
    const queryType = (query.queryType ?? "M") as "D" | "W" | "M"
    const granularity = query.granularity ?? "hourly"

    try {
      const { fetchRateTrend, aggregateDailyRates } = await import("../services/market-data/rateFetcher.js")
      const trend = await fetchRateTrend(queryType)
      const data = granularity === "daily"
        ? aggregateDailyRates(trend.data).slice(-days)
        : trend.data.slice(-(days * 24))
      return ok({
        ccyPair: trend.ccyPair,
        currentRate: trend.currentRate,
        currentDateTime: trend.currentDateTime,
        data,
      })
    } catch (e) {
      const bars = await getLatestBars(process.env.DEFAULT_SYMBOL ?? "USDCNH", days * 24)
      return ok({
        ccyPair: "USD/CNH",
        currentRate: bars.length > 0 ? bars[bars.length - 1].close : null,
        currentDateTime: new Date().toISOString(),
        data: bars.map((b) => ({
          date: b.tradeDate.toISOString().slice(0, 16).replace("T", " "),
          rate: b.close,
        })),
      })
    }
  })

  // ── Formula preview (evaluate expression against real data) ──
  app.post("/api/v1/admin/indicator-configs/preview-formula", async (req, reply) => {
    const { expression, params, timeframe } = req.body as {
      expression: string
      params?: Record<string, number>
      timeframe?: string
    }
    if (!expression?.trim()) {
      reply.status(400)
      return err(400, "expression is required")
    }
    const validation = validateFormula(expression)
    if (!validation.valid) {
      return ok({ valid: false, error: validation.error, dates: [], values: [] })
    }
    try {
      const limitMap: Record<string, number> = { "1h": 120, "4h": 90, "1d": 60 }
      const limit = limitMap[timeframe ?? "1d"] ?? 60
      const bars = await getLatestBars(
        (process.env.DEFAULT_SYMBOL ?? "USDCNH"),
        limit,
      )
      if (bars.length === 0) {
        return ok({ valid: true, dates: [], values: [], error: "暂无行情数据" })
      }
      const values = evaluateFormula(expression, bars, params ?? {})
      const dates = bars.map((b) => b.tradeDate.toISOString().slice(0, 10))
      return ok({ valid: true, dates, values, timeframe: timeframe ?? "1d" })
    } catch (e) {
      return ok({ valid: false, error: (e as Error).message, dates: [], values: [] })
    }
  })

  // ── Indicator Group CRUD ──
  app.get("/api/v1/admin/indicator-groups", async () => {
    const groups = await prisma.indicatorGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { indicators: true } } },
    })
    return ok(groups)
  })

  app.post("/api/v1/admin/indicator-groups", async (req, reply) => {
    const body = req.body as {
      name: string; displayName: string; description?: string
      sortOrder?: number; icon?: string; color?: string
    }
    if (!body.name || !body.displayName) {
      reply.status(400)
      return err(400, "name 和 displayName 为必填项")
    }
    try {
      const group = await prisma.indicatorGroup.create({
        data: {
          name: body.name,
          displayName: body.displayName,
          description: body.description,
          sortOrder: body.sortOrder ?? 0,
          icon: body.icon,
          color: body.color,
        },
      })
      return ok(group)
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  app.put<{ Params: { id: string } }>("/api/v1/admin/indicator-groups/:id", async (req, reply) => {
    const { id } = req.params
    const body = req.body as Partial<{
      name: string; displayName: string; description: string
      sortOrder: number; icon: string; color: string
    }>
    try {
      const group = await prisma.indicatorGroup.update({ where: { id }, data: body })
      return ok(group)
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  app.delete<{ Params: { id: string } }>("/api/v1/admin/indicator-groups/:id", async (req, reply) => {
    const { id } = req.params
    try {
      const count = await prisma.indicatorConfig.count({ where: { groupId: id } })
      if (count > 0) {
        reply.status(400)
        return err(400, `该分组下仍有 ${count} 个指标配置，请先调整它们的分组后再删除`)
      }
      await prisma.indicatorGroup.delete({ where: { id } })
      return ok({ deleted: true })
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  // ── Indicator Config CRUD ──
  app.get("/api/v1/admin/indicator-configs", async () => {
    const configs = await prisma.indicatorConfig.findMany({
      orderBy: { createdAt: "asc" },
      include: { group: { select: { id: true, name: true, displayName: true, color: true } } },
    })
    return ok(configs)
  })

  app.put<{ Params: { id: string } }>("/api/v1/admin/indicator-configs/:id", async (req, reply) => {
    const { id } = req.params
    const body = req.body as Partial<{
      params: string; signalThresholds: string; enabled: boolean; weight: number
      displayName: string; description: string; formulaLatex: string; formulaExpression: string
      category1: string; category2: string; category3: string; groupId: string | null
      stepFormulas: string; chartType: string; subChart: boolean
    }>
    try {
      const config = await prisma.indicatorConfig.update({ where: { id }, data: body })
      invalidateConfigCache()
      return ok(config)
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  app.post("/api/v1/admin/indicator-configs", async (req, reply) => {
    const body = req.body as {
      indicatorType: string; displayName: string; description?: string
      formulaLatex?: string; formulaExpression?: string; stepFormulas?: string
      params: string; signalThresholds: string; weight?: number
      category1?: string; category2?: string; category3?: string; groupId?: string
      chartType?: string; subChart?: boolean
    }
    if (!body.indicatorType || !body.displayName || !body.params || !body.signalThresholds) {
      reply.status(400)
      return err(400, "indicatorType, displayName, params, signalThresholds are required")
    }
    try {
      const config = await prisma.indicatorConfig.create({
        data: {
          indicatorType: body.indicatorType,
          displayName: body.displayName,
          description: body.description,
          formulaLatex: body.formulaLatex,
          formulaExpression: body.formulaExpression,
          stepFormulas: body.stepFormulas,
          params: body.params,
          signalThresholds: body.signalThresholds,
          weight: body.weight ?? 1.0,
          category1: body.category1 ?? "custom",
          category2: body.category2,
          category3: body.category3,
          groupId: body.groupId,
          chartType: body.chartType ?? "line",
          subChart: body.subChart ?? true,
        },
      })
      invalidateConfigCache()
      return ok(config)
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  app.delete<{ Params: { id: string } }>("/api/v1/admin/indicator-configs/:id", async (req, reply) => {
    try {
      await prisma.indicatorConfig.delete({ where: { id: req.params.id } })
      invalidateConfigCache()
      return ok({ deleted: true })
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  app.post("/api/v1/admin/indicator-configs/validate-formula", async (req) => {
    const { expression } = req.body as { expression: string }
    return ok(validateFormula(expression ?? ""))
  })

  // ── Validate step formulas ──
  app.post("/api/v1/admin/indicator-configs/validate-step-formulas", async (req) => {
    const { steps, params } = req.body as {
      steps: { variable: string; label: string; expression: string; description?: string }[]
      params?: Record<string, number>
    }
    if (!Array.isArray(steps)) return ok({ valid: false, errors: [{ step: 0, variable: "", error: "steps must be an array" }] })
    return ok(validateStepFormulas(steps, params ?? {}))
  })

  // ── Indicator category tree ──
  app.get("/api/v1/admin/indicator-categories", async () => {
    const configs = await prisma.indicatorConfig.findMany({
      select: { category1: true, category2: true, category3: true },
    })
    const tree: Record<string, Record<string, Set<string>>> = {}
    for (const c of configs) {
      const c1 = c.category1 ?? "custom"
      const c2 = c.category2 ?? "default"
      const c3 = c.category3 ?? ""
      if (!tree[c1]) tree[c1] = {}
      if (!tree[c1][c2]) tree[c1][c2] = new Set()
      if (c3) tree[c1][c2].add(c3)
    }
    const result = Object.entries(tree).map(([c1, c2Map]) => ({
      category1: c1,
      children: Object.entries(c2Map).map(([c2, c3Set]) => ({
        category2: c2,
        children: [...c3Set],
      })),
    }))
    return ok(result)
  })

  // ── Latest task output (for cron job detail view) ──
  app.get<{ Params: { taskType: string } }>("/api/v1/admin/cron/latest-output/:taskType", async (req) => {
    const { taskType } = req.params
    const log = await prisma.taskRunLog.findFirst({
      where: { taskType, status: "success" },
      orderBy: { finishedAt: "desc" },
    })
    if (!log?.outputRef) return ok(null)
    try {
      return ok(JSON.parse(log.outputRef))
    } catch {
      return ok(null)
    }
  })

  // ── Predictions timeline (for AI prediction chart) ──
  app.get("/api/v1/admin/predictions/timeline", async (req) => {
    const query = req.query as { symbol?: string; limit?: string }
    const symbol = query.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "30")))

    const predictions = await prisma.predictionResult.findMany({
      where: { symbol },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        symbol: true,
        direction: true,
        confidence: true,
        horizon: true,
        createdAt: true,
        modelVersion: true,
        signalsSnapshot: true,
        indicatorsSnapshot: true,
      },
    })
    return ok(predictions.reverse())
  })

  // ── Single prediction detail ──
  app.get<{ Params: { id: string } }>("/api/v1/admin/predictions/:id", async (req, reply) => {
    const prediction = await prisma.predictionResult.findUnique({
      where: { id: req.params.id },
    })
    if (!prediction) {
      reply.status(404)
      return err(404, "Prediction not found")
    }
    return ok(prediction)
  })
}
