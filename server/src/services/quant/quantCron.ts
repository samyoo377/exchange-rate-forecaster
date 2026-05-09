import cron from "node-cron"
import { prisma } from "../../utils/db.js"
import { runQuantAnalysis } from "./quantEngine.js"
import type { CronJobStatus } from "../news/cronJobs.js"

let quantTask: cron.ScheduledTask | null = null

const quantStatus: CronJobStatus = {
  name: "quant_analysis",
  cron: "0 2,6,10,14 * * 1-5",
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

async function runQuantJob() {
  if (quantStatus.running) return
  quantStatus.running = true
  const t0 = Date.now()
  quantStatus.totalRuns++

  const taskLog = await prisma.taskRunLog.create({
    data: {
      taskType: "quant_analysis",
      status: "running",
      startedAt: new Date(),
      inputRef: JSON.stringify({ trigger: "cron", symbol: "USDCNH" }),
    },
  }).catch(() => null)

  try {
    const result = await runQuantAnalysis("USDCNH")

    quantStatus.lastResult = "success"
    quantStatus.lastRunAt = new Date().toISOString()
    quantStatus.lastDurationMs = Date.now() - t0

    if (taskLog) {
      await prisma.taskRunLog.update({
        where: { id: taskLog.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          outputRef: JSON.stringify({
            compositeScore: result.compositeScore,
            regime: result.regime,
            confidence: result.confidence,
          }),
        },
      }).catch(() => {})
    }
  } catch (e) {
    quantStatus.lastResult = "error"
    quantStatus.lastError = (e as Error).message
    quantStatus.totalErrors++
    quantStatus.lastRunAt = new Date().toISOString()
    quantStatus.lastDurationMs = Date.now() - t0

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
    quantStatus.running = false
  }
}

export function getQuantCronStatus(): CronJobStatus {
  return { ...quantStatus }
}

export function startQuantCronJob() {
  quantStatus.startedAt = new Date().toISOString()

  quantTask = cron.schedule(quantStatus.cron, () => {
    runQuantJob()
  })

  runQuantJob()
}

export function stopQuantCronJob() {
  quantTask?.stop()
  quantTask = null
}

export async function triggerQuantManually() {
  await runQuantJob()
  return quantStatus
}
