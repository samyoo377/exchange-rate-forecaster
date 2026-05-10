import cron from "node-cron"
import { fetchAllNews } from "./newsFetcher.js"
import { digestRecentNews } from "./newsDigester.js"
import { fetchRateTrend } from "../market-data/rateFetcher.js"
import { prisma } from "../../utils/db.js"

let fetchTask: cron.ScheduledTask | null = null
let digestTask: cron.ScheduledTask | null = null
let rateFetchTask1: cron.ScheduledTask | null = null
let rateFetchTask2: cron.ScheduledTask | null = null

const abortFlags: Record<string, boolean> = {
  news_fetch: false,
  news_digest: false,
  rate_fetch: false,
}

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

const rateFetchStatus: CronJobStatus = {
  name: "rate_fetch",
  cron: "30 1,10 * * *",
  intervalMs: 12 * 60 * 60_000,
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
  rateFetchStatus.nextRunAt = computeNextCronRun(rateFetchStatus.cron)
  return [{ ...fetchStatus }, { ...digestStatus }, { ...rateFetchStatus }]
}

export function startNewsCronJobs() {
  const now = new Date().toISOString()
  fetchStatus.startedAt = now
  digestStatus.startedAt = now
  rateFetchStatus.startedAt = now

  fetchTask = createFetchSchedule()
  digestTask = createDigestSchedule()
  rateFetchTask1 = createRateFetchSchedule("30 1 * * *")
  rateFetchTask2 = createRateFetchSchedule("0 10 * * *")

  console.log("[Cron] News fetch (every 5 min), digest (every 30 min), rate fetch (09:30 & 18:00 CST) started")

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
      const result = await fetchAllNews()
      fetchStatus.lastResult = "success"
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
  rateFetchTask1?.stop()
  rateFetchTask2?.stop()
  fetchTask = null
  digestTask = null
  rateFetchTask1 = null
  rateFetchTask2 = null
  console.log("[Cron] News cron jobs stopped")
}

export function requestAbort(taskType: string): boolean {
  if (taskType === "news_fetch" && fetchStatus.running) {
    abortFlags.news_fetch = true
    return true
  }
  if (taskType === "news_digest" && digestStatus.running) {
    abortFlags.news_digest = true
    return true
  }
  if (taskType === "rate_fetch" && rateFetchStatus.running) {
    abortFlags.rate_fetch = true
    return true
  }
  return false
}

export function isAborted(taskType: string): boolean {
  return !!abortFlags[taskType]
}

function createFetchSchedule() {
  return cron.schedule("*/5 * * * *", async () => {
    abortFlags.news_fetch = false
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
      const result = await fetchAllNews()
      if (abortFlags.news_fetch) {
        fetchStatus.lastResult = "error"
        fetchStatus.lastError = "已中断"
        if (taskLog) {
          await prisma.taskRunLog.update({
            where: { id: taskLog.id },
            data: { status: "aborted", finishedAt: new Date(), errorMessage: "用户手动中断" },
          }).catch(() => {})
        }
      } else {
        fetchStatus.lastResult = "success"
        fetchStatus.lastError = null
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
      abortFlags.news_fetch = false
    }
  })
}

function createDigestSchedule() {
  return cron.schedule("*/30 * * * *", async () => {
    abortFlags.news_digest = false
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
      if (abortFlags.news_digest) {
        digestStatus.lastResult = "error"
        digestStatus.lastError = "已中断"
        if (taskLog) {
          await prisma.taskRunLog.update({
            where: { id: taskLog.id },
            data: { status: "aborted", finishedAt: new Date(), errorMessage: "用户手动中断" },
          }).catch(() => {})
        }
      } else {
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
      abortFlags.news_digest = false
    }
  })
}

export function resetCronTimer(taskType: string) {
  if (taskType === "news_fetch" && fetchTask) {
    fetchTask.stop()
    fetchTask = createFetchSchedule()
  } else if (taskType === "news_digest" && digestTask) {
    digestTask.stop()
    digestTask = createDigestSchedule()
  }
}

function createRateFetchSchedule(cronExpr: string) {
  return cron.schedule(cronExpr, async () => {
    abortFlags.rate_fetch = false
    rateFetchStatus.running = true
    const t0 = Date.now()
    const taskLog = await prisma.taskRunLog.create({
      data: {
        taskType: "rate_fetch",
        status: "running",
        startedAt: new Date(),
      },
    }).catch(() => null)
    try {
      const result = await fetchRateTrend("M", "USD")
      if (abortFlags.rate_fetch) {
        rateFetchStatus.lastResult = "error"
        rateFetchStatus.lastError = "已中断"
        if (taskLog) {
          await prisma.taskRunLog.update({
            where: { id: taskLog.id },
            data: { status: "aborted", finishedAt: new Date(), errorMessage: "用户手动中断" },
          }).catch(() => {})
        }
      } else {
        rateFetchStatus.lastResult = "success"
        rateFetchStatus.lastError = null
        if (taskLog) {
          await prisma.taskRunLog.update({
            where: { id: taskLog.id },
            data: {
              status: "success",
              finishedAt: new Date(),
              outputRef: JSON.stringify({ dataPoints: result.data.length, currentRate: result.currentRate }),
            },
          }).catch(() => {})
        }
      }
    } catch (e) {
      rateFetchStatus.lastResult = "error"
      rateFetchStatus.lastError = (e as Error).message
      rateFetchStatus.totalErrors++
      console.error("[Cron] Rate fetch failed:", (e as Error).message)
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
      rateFetchStatus.running = false
      rateFetchStatus.lastRunAt = new Date().toISOString()
      rateFetchStatus.lastDurationMs = Date.now() - t0
      rateFetchStatus.totalRuns++
      abortFlags.rate_fetch = false
    }
  })
}
