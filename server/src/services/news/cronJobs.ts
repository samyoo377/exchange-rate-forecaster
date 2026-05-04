import cron from "node-cron"
import { fetchAllNews } from "./newsFetcher.js"
import { digestRecentNews } from "./newsDigester.js"
import { prisma } from "../../utils/db.js"

let fetchTask: cron.ScheduledTask | null = null
let digestTask: cron.ScheduledTask | null = null

export interface CronJobStatus {
  name: string
  cron: string
  intervalMs: number
  running: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  lastResult: "success" | "error" | null
  lastError: string | null
  lastDurationMs: number | null
  totalRuns: number
  totalErrors: number
  startedAt: string | null
}

const fetchStatus: CronJobStatus = {
  name: "news_fetch",
  cron: "*/5 * * * *",
  intervalMs: 5 * 60_000,
  running: false,
  lastRunAt: null,
  nextRunAt: null,
  lastResult: null,
  lastError: null,
  lastDurationMs: null,
  totalRuns: 0,
  totalErrors: 0,
  startedAt: null,
}

const digestStatus: CronJobStatus = {
  name: "news_digest",
  cron: "*/30 * * * *",
  intervalMs: 30 * 60_000,
  running: false,
  lastRunAt: null,
  nextRunAt: null,
  lastResult: null,
  lastError: null,
  lastDurationMs: null,
  totalRuns: 0,
  totalErrors: 0,
  startedAt: null,
}

function computeNextCronRun(cronExpr: string): string {
  const now = new Date()
  const parts = cronExpr.split(" ")
  const minPart = parts[0]

  if (minPart.startsWith("*/")) {
    const interval = parseInt(minPart.slice(2))
    const currentMin = now.getMinutes()
    const nextMin = Math.ceil((currentMin + 1) / interval) * interval
    const next = new Date(now)
    next.setSeconds(0, 0)
    if (nextMin >= 60) {
      next.setMinutes(0)
      next.setHours(next.getHours() + 1)
    } else {
      next.setMinutes(nextMin)
    }
    return next.toISOString()
  }

  const next = new Date(now)
  next.setMinutes(next.getMinutes() + 1)
  next.setSeconds(0, 0)
  return next.toISOString()
}

export function getCronStatus(): CronJobStatus[] {
  fetchStatus.nextRunAt = computeNextCronRun(fetchStatus.cron)
  digestStatus.nextRunAt = computeNextCronRun(digestStatus.cron)
  return [{ ...fetchStatus }, { ...digestStatus }]
}

export function startNewsCronJobs() {
  const now = new Date().toISOString()
  fetchStatus.startedAt = now
  digestStatus.startedAt = now

  fetchTask = cron.schedule("*/5 * * * *", async () => {
    fetchStatus.running = true
    const t0 = Date.now()
    const taskLog = await prisma.taskRunLog.create({
      data: {
        taskType: "news_fetch",
        status: "running",
        startedAt: new Date(),
      },
    }).catch(() => null)
    try {
      const count = await fetchAllNews()
      fetchStatus.lastResult = "success"
      fetchStatus.lastError = null
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
    } catch (e) {
      fetchStatus.lastResult = "error"
      fetchStatus.lastError = (e as Error).message
      fetchStatus.totalErrors++
      console.error("[Cron] News fetch failed:", (e as Error).message)
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
    } finally {
      fetchStatus.running = false
      fetchStatus.lastRunAt = new Date().toISOString()
      fetchStatus.lastDurationMs = Date.now() - t0
      fetchStatus.totalRuns++
    }
  })

  digestTask = cron.schedule("*/30 * * * *", async () => {
    digestStatus.running = true
    const t0 = Date.now()
    const taskLog = await prisma.taskRunLog.create({
      data: {
        taskType: "news_digest",
        status: "running",
        startedAt: new Date(),
      },
    }).catch(() => null)
    try {
      const result = await digestRecentNews()
      digestStatus.lastResult = "success"
      digestStatus.lastError = null
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
    } catch (e) {
      digestStatus.lastResult = "error"
      digestStatus.lastError = (e as Error).message
      digestStatus.totalErrors++
      console.error("[Cron] News digest failed:", (e as Error).message)
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
    } finally {
      digestStatus.running = false
      digestStatus.lastRunAt = new Date().toISOString()
      digestStatus.lastDurationMs = Date.now() - t0
      digestStatus.totalRuns++
    }
  })

  console.log("[Cron] News fetch (every 1 min) and digest (every 30 min) started")

  // initial fetch
  ;(async () => {
    fetchStatus.running = true
    const t0 = Date.now()
    const taskLog = await prisma.taskRunLog.create({
      data: {
        taskType: "news_fetch",
        status: "running",
        startedAt: new Date(),
        inputRef: JSON.stringify({ trigger: "startup" }),
      },
    }).catch(() => null)
    try {
      const count = await fetchAllNews()
      fetchStatus.lastResult = "success"
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
    } catch (e) {
      fetchStatus.lastResult = "error"
      fetchStatus.lastError = (e as Error).message
      fetchStatus.totalErrors++
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
    } finally {
      fetchStatus.running = false
      fetchStatus.lastRunAt = new Date().toISOString()
      fetchStatus.lastDurationMs = Date.now() - t0
      fetchStatus.totalRuns++
    }
  })()
}

export function stopNewsCronJobs() {
  fetchTask?.stop()
  digestTask?.stop()
  fetchTask = null
  digestTask = null
  console.log("[Cron] News cron jobs stopped")
}
