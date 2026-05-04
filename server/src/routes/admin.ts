import type { FastifyInstance } from "fastify"
import { Prisma } from "@prisma/client"
import { prisma } from "../utils/db.js"
import { ok, err } from "../utils/helpers.js"
import { getCronStatus } from "../services/news/index.js"
import { fetchAllNews } from "../services/news/newsFetcher.js"
import { testFetchSource } from "../services/news/newsFetcher.js"
import { digestRecentNews } from "../services/news/newsDigester.js"
import { streamAdminChat, executeAdminQuery, getAdminModels } from "../services/ai/adminAssistant.js"
import { invalidateConfigCache } from "../services/indicators/configService.js"
import { validateFormula } from "../services/indicators/formulaEvaluator.js"
import {
  createSession, listSessions, getSessionWithMessages,
  deleteSession, addMessage, generateSessionTitle, getSessionHistory,
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
    return ok(getCronStatus())
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
      const count = await fetchAllNews()
      if (taskLog) {
        await prisma.taskRunLog.update({
          where: { id: taskLog.id },
          data: {
            status: "success",
            finishedAt: new Date(),
            outputRef: JSON.stringify({ fetchedCount: count }),
          },
        }).catch(() => {})
      }
      return ok({ triggered: true, fetchedCount: count })
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
    const { message, sessionId: inputSessionId, history, model } = req.body as {
      message: string
      sessionId?: string
      history?: { role: "user" | "assistant"; content: string }[]
      model?: string
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

      await addMessage(sessionId, "user", message)

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
      for await (const chunk of streamAdminChat(message, chatHistory, model)) {
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
    return ok(session)
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

  // ── Indicator Config CRUD ──
  app.get("/api/v1/admin/indicator-configs", async () => {
    const configs = await prisma.indicatorConfig.findMany({ orderBy: { createdAt: "asc" } })
    return ok(configs)
  })

  app.put<{ Params: { id: string } }>("/api/v1/admin/indicator-configs/:id", async (req, reply) => {
    const { id } = req.params
    const body = req.body as Partial<{
      params: string; signalThresholds: string; enabled: boolean; weight: number
      displayName: string; description: string; formulaLatex: string; formulaExpression: string
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
      formulaLatex?: string; formulaExpression?: string
      params: string; signalThresholds: string; weight?: number
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
          params: body.params,
          signalThresholds: body.signalThresholds,
          weight: body.weight ?? 1.0,
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
}
