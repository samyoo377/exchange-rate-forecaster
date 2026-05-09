import type { FastifyInstance } from "fastify"
import { ok, err } from "../utils/helpers.js"
import { fetchFromAlphaVantage, upsertSnapshots } from "../services/market-data/alphaProvider.js"
import { parseExcelFile } from "../services/file-ingestion/excelParser.js"
import { getDashboard, runPrediction } from "../services/dashboard/dashboardService.js"
import type { Interval } from "../services/dashboard/dashboardService.js"
import { getPredictionHistory, getTaskHistory, getPredictionStats } from "../services/history/historyService.js"
import { streamChat } from "../services/ai/chatService.js"
import { digestRecentNews, getLatestDigest, fetchAllNews } from "../services/news/index.js"
import { saveUploadedFile } from "../services/file/fileService.js"
import { getIndicatorConfigs } from "../services/indicators/configService.js"
import {
  createSession, listSessions, getSessionWithMessages,
  deleteSession, addMessage, generateSessionTitle, getSessionHistory,
  enrichMessagesWithAttachments,
} from "../services/chat/sessionService.js"
import { prisma } from "../utils/db.js"
import * as path from "path"

const PROJECT_ROOT = path.resolve(process.cwd(), "..")

function resolveDataPath(p: string): string {
  if (path.isAbsolute(p)) return p
  return path.resolve(PROJECT_ROOT, p)
}

export async function registerRoutes(app: FastifyInstance) {
  const serverStartedAt = Date.now()

  // health check
  app.get("/health", async () => {
    return ok({
      service: "exchange-rate-forecaster",
      time: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
    })
  })

  // manual data refresh
  app.post("/api/v1/data/refresh", async (request, reply) => {
    const body = request.body as { symbol?: string; source?: string }
    const symbol = body?.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"
    const source = body?.source ?? "alpha_vantage"

    const taskLog = await prisma.taskRunLog.create({
      data: {
        taskType: "data_refresh",
        status: "running",
        startedAt: new Date(),
        inputRef: JSON.stringify({ symbol, source }),
      },
    })

    try {
      let bars
      if (source === "excel") {
        const filePath = resolveDataPath(
          process.env.DATA_IMPORT_DEFAULT_PATH ?? "../USDCNH-BBG-20Days.xlsx"
        )
        bars = parseExcelFile(filePath, symbol)
      } else {
        bars = await fetchFromAlphaVantage(symbol)
      }
      const count = await upsertSnapshots(bars)

      await prisma.taskRunLog.update({
        where: { id: taskLog.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          outputRef: JSON.stringify({ snapshotCount: count }),
        },
      })

      return ok({ taskId: taskLog.id, status: "success", snapshotCount: count })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await prisma.taskRunLog.update({
        where: { id: taskLog.id },
        data: { status: "failed", finishedAt: new Date(), errorMessage: msg },
      })
      reply.status(500)
      return err(50001, `数据刷新失败: ${msg}`)
    }
  })

  // import excel
  app.post("/api/v1/files/import", async (request, reply) => {
    const body = request.body as { filePath?: string; symbol?: string }
    const filePath = body?.filePath
    const symbol = body?.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"

    if (!filePath) {
      reply.status(400)
      return err(40001, "filePath 不能为空")
    }

    const taskLog = await prisma.taskRunLog.create({
      data: {
        taskType: "file_import",
        status: "running",
        startedAt: new Date(),
        inputRef: JSON.stringify({ filePath, symbol }),
      },
    })

    try {
      const bars = parseExcelFile(resolveDataPath(filePath), symbol)
      const count = await upsertSnapshots(bars)

      await prisma.taskRunLog.update({
        where: { id: taskLog.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          outputRef: JSON.stringify({ inserted: count }),
        },
      })

      return ok({ taskId: taskLog.id, inserted: count })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await prisma.taskRunLog.update({
        where: { id: taskLog.id },
        data: { status: "failed", finishedAt: new Date(), errorMessage: msg },
      })
      reply.status(500)
      return err(40002, `文件导入失败: ${msg}`)
    }
  })

  // ── File upload ──
  app.post("/api/v1/files/upload", async (request, reply) => {
    try {
      const file = await request.file()
      if (!file) {
        reply.status(400)
        return err(40001, "No file uploaded")
      }

      const buffer = await file.toBuffer()
      const result = await saveUploadedFile(
        buffer,
        file.filename,
        file.mimetype,
      )
      return ok(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      reply.status(500)
      return err(50001, `文件上传失败: ${msg}`)
    }
  })

  // ── Chat Session CRUD ──
  app.post("/api/v1/chat/sessions", async (request) => {
    const body = request.body as { scope?: string; symbol?: string; horizon?: string } | null
    const scope = (body?.scope ?? "web") as "web" | "admin"
    const symbol = body?.symbol ?? "USDCNH"
    const horizon = body?.horizon ?? "T+2"
    const session = await createSession(scope, symbol, horizon)
    return ok(session)
  })

  app.get("/api/v1/chat/sessions", async (request) => {
    const query = request.query as { scope?: string; limit?: string }
    const scope = (query.scope ?? "web") as "web" | "admin"
    const limit = Math.min(100, parseInt(query.limit ?? "50"))
    const sessions = await listSessions(scope, limit)
    return ok(sessions)
  })

  app.get<{ Params: { id: string } }>("/api/v1/chat/sessions/:id", async (request, reply) => {
    const session = await getSessionWithMessages(request.params.id)
    if (!session) {
      reply.status(404)
      return err(40401, "会话不存在")
    }
    const enrichedMessages = await enrichMessagesWithAttachments(session.messages)
    return ok({ ...session, messages: enrichedMessages })
  })

  app.delete<{ Params: { id: string } }>("/api/v1/chat/sessions/:id", async (request, reply) => {
    try {
      await deleteSession(request.params.id)
      return ok({ deleted: true })
    } catch (e) {
      reply.status(500)
      return err(500, (e as Error).message)
    }
  })

  // dashboard latest
  app.get("/api/v1/dashboard/latest", async (request, reply) => {
    const query = request.query as { symbol?: string; interval?: string }
    const symbol = query.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"
    const validIntervals = new Set(["1h", "4h", "1d"])
    const interval = (validIntervals.has(query.interval ?? "") ? query.interval : "1d") as Interval

    try {
      const data = await getDashboard(symbol, interval)
      if (!data) {
        reply.status(200)
        return ok(null, "暂无数据，请先导入或刷新行情")
      }
      return ok(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      reply.status(500)
      return err(50002, msg)
    }
  })

  // indicator configs (public, for web display)
  const BUILTIN_DATA_KEYS: Record<string, string[]> = {
    RSI: ["rsi14"],
    STOCH: ["stochK", "stochD"],
    CCI: ["cci20"],
    ADX: ["adx14", "plusDi14", "minusDi14"],
    AO: ["ao"],
    MOM: ["mom10"],
  }

  app.get("/api/v1/indicators/configs", async () => {
    const configs = await getIndicatorConfigs()
    const groupIds = new Set<string>()
    for (const [, config] of configs) {
      if (config.groupId) groupIds.add(config.groupId)
    }
    const groups = groupIds.size > 0
      ? await prisma.indicatorGroup.findMany({ where: { id: { in: [...groupIds] } } })
      : []
    const groupMap = new Map(groups.map((g) => [g.id, g]))

    const result = []
    for (const [type, config] of configs) {
      const isBuiltin = !!BUILTIN_DATA_KEYS[type]
      const dataKeys = isBuiltin
        ? BUILTIN_DATA_KEYS[type]
        : [type.toLowerCase().replace(/-/g, "_")]
      const group = config.groupId ? groupMap.get(config.groupId) : null
      result.push({
        indicatorType: type,
        displayName: config.displayName,
        description: config.description,
        params: JSON.parse(config.params),
        signalThresholds: JSON.parse(config.signalThresholds),
        dataKeys,
        isBuiltin,
        chartType: config.chartType ?? (type === "AO" ? "bar" : "line"),
        subChart: config.subChart ?? true,
        category1: config.category1 ?? "custom",
        category2: config.category2,
        category3: config.category3,
        groupId: config.groupId,
        groupName: group?.displayName ?? null,
        groupColor: group?.color ?? null,
        groupSortOrder: group?.sortOrder ?? 999,
      })
    }
    return ok(result)
  })

  // prediction query
  app.post("/api/v1/predictions/query", async (request, reply) => {
    const body = request.body as { symbol?: string; question?: string; horizon?: string }
    const symbol = body?.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"
    const question = body?.question ?? ""
    const horizon = body?.horizon ?? "T+2"

    if (!question.trim()) {
      reply.status(400)
      return err(40001, "question 不能为空")
    }

    try {
      const prediction = await runPrediction(symbol, horizon, question)
      return ok(prediction)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      reply.status(500)
      return err(50003, `预测生成失败: ${msg}`)
    }
  })

  // prediction history
  app.get("/api/v1/history/predictions", async (request) => {
    const q = request.query as {
      symbol?: string; page?: string; pageSize?: string
      direction?: string; horizon?: string; dateFrom?: string; dateTo?: string
    }
    const symbol = q.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"
    const page = Math.max(1, parseInt(q.page ?? "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? "20")))
    const result = await getPredictionHistory(symbol, page, pageSize, q.direction, q.horizon, q.dateFrom, q.dateTo)
    return ok(result)
  })

  app.get("/api/v1/history/predictions/stats", async (request) => {
    const q = request.query as { symbol?: string; days?: string }
    const symbol = q.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"
    const days = Math.min(90, Math.max(1, parseInt(q.days ?? "30")))
    const stats = await getPredictionStats(symbol, days)
    return ok(stats)
  })

  // task history
  app.get("/api/v1/history/tasks", async (request) => {
    const q = request.query as { taskType?: string; page?: string; pageSize?: string }
    const page = Math.max(1, parseInt(q.page ?? "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? "20")))
    const result = await getTaskHistory(q.taskType, page, pageSize)
    return ok(result)
  })

  // ── AI chat stream (SSE) with session persistence ──
  app.post("/api/v1/chat/stream", async (request, reply) => {
    const body = request.body as {
      message?: string
      symbol?: string
      horizon?: string
      sessionId?: string
      attachmentIds?: string[]
      history?: { role: "user" | "assistant"; content: string }[]
    }
    const message = body?.message?.trim()
    const symbol = body?.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"
    const horizon = body?.horizon ?? "T+2"
    const attachmentIds = body?.attachmentIds ?? []

    if (!message) {
      reply.status(400)
      return err(40001, "message 不能为空")
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    })

    try {
      let sessionId = body?.sessionId
      let isNewSession = false

      if (sessionId) {
        const existing = await getSessionWithMessages(sessionId)
        if (!existing) {
          sessionId = undefined
        }
      }

      if (!sessionId) {
        const session = await createSession("web", symbol, horizon)
        sessionId = session.id
        isNewSession = true
        reply.raw.write(`data: ${JSON.stringify({ sessionId })}\n\n`)
      }

      const sid = sessionId!

      await addMessage(sid, "user", message, attachmentIds.length > 0 ? attachmentIds : undefined)

      if (isNewSession) {
        await generateSessionTitle(sid, message)
      }

      let history: { role: string; content: string }[]
      if (body?.sessionId) {
        const dbHistory = await getSessionHistory(sid)
        history = dbHistory.slice(0, -1).filter((m) => m.role !== "system").slice(-20)
      } else {
        history = (body?.history ?? []).map((m) => ({
          role: m.role,
          content: m.content,
        }))
      }

      reply.raw.write(`data: ${JSON.stringify({ thinking: true })}\n\n`)

      let fullResponse = ""
      for await (const chunk of streamChat(message, symbol, horizon, history, attachmentIds)) {
        reply.raw.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
        fullResponse += chunk
      }

      await addMessage(sid, "assistant", fullResponse)

      reply.raw.write("data: [DONE]\n\n")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
    } finally {
      reply.raw.end()
    }
  })

  // --- News endpoints ---

  // Trigger news fetch immediately
  app.post("/api/v1/news/fetch", async (_request, reply) => {
    const taskLog = await prisma.taskRunLog.create({
      data: {
        taskType: "news_fetch",
        status: "running",
        startedAt: new Date(),
        inputRef: JSON.stringify({ trigger: "manual_api" }),
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
      return ok({ fetched: result.fetchedCount })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (taskLog) {
        await prisma.taskRunLog.update({
          where: { id: taskLog.id },
          data: { status: "failed", finishedAt: new Date(), errorMessage: msg },
        }).catch(() => {})
      }
      reply.status(500)
      return err(50010, `新闻抓取失败: ${msg}`)
    }
  })

  // Trigger news digest immediately
  app.post("/api/v1/news/digest/trigger", async (request, reply) => {
    const body = request.body as { symbol?: string } | null
    const symbol = body?.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"

    const taskLog = await prisma.taskRunLog.create({
      data: {
        taskType: "news_digest",
        status: "running",
        startedAt: new Date(),
        inputRef: JSON.stringify({ trigger: "manual_api", symbol }),
      },
    }).catch(() => null)

    try {
      const result = await digestRecentNews(symbol)
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
      if (!result) {
        return ok(null, "暂无可消化的新闻数据")
      }
      return ok(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (taskLog) {
        await prisma.taskRunLog.update({
          where: { id: taskLog.id },
          data: { status: "failed", finishedAt: new Date(), errorMessage: msg },
        }).catch(() => {})
      }
      reply.status(500)
      return err(50011, `新闻消化失败: ${msg}`)
    }
  })

  // Get latest news digest
  app.get("/api/v1/news/digest/latest", async (request, reply) => {
    const query = request.query as { symbol?: string }
    const symbol = query.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"

    try {
      const digest = await getLatestDigest(symbol)
      if (!digest) {
        return ok(null, "暂无消息面摘要")
      }
      return ok(digest)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      reply.status(500)
      return err(50012, msg)
    }
  })

  // ── Predictions timeline (for Web AI prediction chart) ──
  app.get("/api/v1/predictions/timeline", async (request) => {
    const query = request.query as { symbol?: string; limit?: string }
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
        rationale: true,
      },
    })
    return ok(predictions.reverse())
  })

  // ── Single prediction detail ──
  app.get<{ Params: { id: string } }>("/api/v1/predictions/:id", async (request, reply) => {
    const prediction = await prisma.predictionResult.findUnique({
      where: { id: request.params.id },
    })
    if (!prediction) {
      reply.status(404)
      return err(40401, "Prediction not found")
    }
    return ok(prediction)
  })
}
