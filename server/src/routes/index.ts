import type { FastifyInstance } from "fastify"
import { ok, err } from "../utils/helpers.js"
import { fetchFromAlphaVantage, upsertSnapshots } from "../services/market-data/alphaProvider.js"
import { parseExcelFile } from "../services/file-ingestion/excelParser.js"
import { getDashboard, runPrediction } from "../services/dashboard/dashboardService.js"
import { getPredictionHistory, getTaskHistory } from "../services/history/historyService.js"
import { prisma } from "../utils/db.js"
import * as path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(process.cwd(), "..")

function resolveDataPath(p: string): string {
  if (path.isAbsolute(p)) return p
  return path.resolve(PROJECT_ROOT, p)
}

export async function registerRoutes(app: FastifyInstance) {
  // health check
  app.get("/health", async () => {
    return ok({ service: "exchange-rate-forecaster", time: new Date().toISOString() })
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

  // dashboard latest
  app.get("/api/v1/dashboard/latest", async (request, reply) => {
    const query = request.query as { symbol?: string }
    const symbol = query.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"

    try {
      const data = await getDashboard(symbol)
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
    const q = request.query as { symbol?: string; page?: string; pageSize?: string }
    const symbol = q.symbol ?? process.env.DEFAULT_SYMBOL ?? "USDCNH"
    const page = Math.max(1, parseInt(q.page ?? "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? "20")))
    const result = await getPredictionHistory(symbol, page, pageSize)
    return ok(result)
  })

  // task history
  app.get("/api/v1/history/tasks", async (request) => {
    const q = request.query as { taskType?: string; page?: string; pageSize?: string }
    const page = Math.max(1, parseInt(q.page ?? "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? "20")))
    const result = await getTaskHistory(q.taskType, page, pageSize)
    return ok(result)
  })
}
