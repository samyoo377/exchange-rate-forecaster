import cron from "node-cron"
import { prisma } from "../../utils/db.js"
import { runPrediction } from "../dashboard/dashboardService.js"
import type { CronJobStatus } from "../news/cronJobs.js"

let predictionTask: cron.ScheduledTask | null = null

const predictionStatus: CronJobStatus = {
  name: "auto_prediction",
  cron: "0 1,5,9,13 * * 1-5",
  intervalMs: 4 * 60 * 60_000,
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

const HORIZONS = ["T+1", "T+2", "T+3"]
const QUERIES: Record<string, string> = {
  "T+1": "自动预测：明日USDCNH走势方向",
  "T+2": "自动预测：后天USDCNH走势方向",
  "T+3": "自动预测：未来3日USDCNH走势方向",
}

async function runAutoPrediction() {
  if (predictionStatus.running) return
  predictionStatus.running = true
  const t0 = Date.now()
  predictionStatus.totalRuns++

  const taskLog = await prisma.taskRunLog.create({
    data: {
      taskType: "auto_prediction",
      status: "running",
      startedAt: new Date(),
      inputRef: JSON.stringify({ trigger: "cron", horizons: HORIZONS }),
    },
  }).catch(() => null)

  try {
    const results = []
    for (const horizon of HORIZONS) {
      const result = await runPrediction("USDCNH", horizon, QUERIES[horizon])
      results.push({ horizon, direction: result.direction, confidence: result.confidence })
    }

    predictionStatus.lastResult = "success"
    predictionStatus.lastRunAt = new Date().toISOString()
    predictionStatus.lastDurationMs = Date.now() - t0

    if (taskLog) {
      await prisma.taskRunLog.update({
        where: { id: taskLog.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          outputRef: JSON.stringify(results),
        },
      }).catch(() => {})
    }
  } catch (e) {
    predictionStatus.lastResult = "error"
    predictionStatus.lastError = (e as Error).message
    predictionStatus.totalErrors++
    predictionStatus.lastRunAt = new Date().toISOString()
    predictionStatus.lastDurationMs = Date.now() - t0

    if (taskLog) {
      await prisma.taskRunLog.update({
        where: { id: taskLog.id },
        data: {
          status: "error",
          finishedAt: new Date(),
          outputRef: JSON.stringify({ error: (e as Error).message }),
        },
      }).catch(() => {})
    }
  } finally {
    predictionStatus.running = false
  }
}

export function getPredictionCronStatus(): CronJobStatus {
  return { ...predictionStatus }
}

export function startPredictionCronJob() {
  predictionStatus.startedAt = new Date().toISOString()

  predictionTask = cron.schedule(predictionStatus.cron, () => {
    runAutoPrediction()
  })

  // Run initial prediction on startup
  runAutoPrediction()
}

export function stopPredictionCronJob() {
  predictionTask?.stop()
  predictionTask = null
}

export async function triggerPredictionManually() {
  await runAutoPrediction()
  return predictionStatus
}
