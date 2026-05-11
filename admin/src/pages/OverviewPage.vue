<template>
  <div class="overview">
    <h2 class="page-title">概览</h2>

    <el-row :gutter="16" class="section">
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-icon tech-bg">📊</div>
          <div class="metric-body">
            <div class="metric-label">技术面信号</div>
            <template v-if="dashData">
              <el-tag :type="techSentiment.type" effect="dark">{{ techSentiment.label }}</el-tag>
            </template>
            <span v-else class="metric-empty">暂无</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-icon news-bg">📰</div>
          <div class="metric-body">
            <div class="metric-label">消息面研判</div>
            <template v-if="latestDigest">
              <el-tag :type="sentimentType(latestDigest.sentiment)" effect="dark">
                {{ sentimentLabel(latestDigest.sentiment) }}
              </el-tag>
            </template>
            <span v-else class="metric-empty">暂无</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-icon pred-bg">🎯</div>
          <div class="metric-body">
            <div class="metric-label">综合预测</div>
            <template v-if="dashData?.latestPrediction">
              <span :class="['direction-text', dashData.latestPrediction.direction]">
                {{ directionText(dashData.latestPrediction.direction) }}
              </span>
              <span class="conf-badge">{{ Math.round(dashData.latestPrediction.confidence * 100) }}%</span>
            </template>
            <span v-else class="metric-empty">暂无</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="section">
      <el-col :span="24">
        <el-card shadow="hover" class="status-card">
          <template #header>
            <div class="card-header">
              <span>定时任务状态</span>
              <el-button size="small" text type="primary" @click="refresh">刷新</el-button>
            </div>
          </template>
          <el-row :gutter="12">
            <el-col :xs="24" :sm="12" :md="6" v-for="job in cronJobs" :key="job.name">
              <div class="cron-mini">
                <div class="cron-mini-header">
                  <span class="cron-dot" :class="job.running ? 'running' : 'idle'"></span>
                  <span class="cron-name">{{ cronJobNameMap[job.name] ?? job.name }}</span>
                </div>
                <div class="cron-mini-meta">
                  <span>{{ job.cron }}</span>
                  <el-tag v-if="job.lastResult" :type="job.lastResult === 'success' ? 'success' : 'danger'" size="small">
                    {{ job.lastResult }}
                  </el-tag>
                </div>
                <div class="cron-mini-time">{{ formatTime(job.lastRunAt) }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="section">
      <el-col :span="24">
        <el-card shadow="hover" class="status-card">
          <template #header>
            <span>数据库统计</span>
          </template>
          <el-row :gutter="12">
            <el-col :xs="12" :sm="8" :md="4" v-for="t in tables" :key="t.name">
              <div class="table-stat" @click="goToTable(t.name)">
                <div class="table-count">{{ t.count >= 0 ? t.count : 'N/A' }}</div>
                <div class="table-name">{{ t.name }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { useRouter } from "vue-router"
import {
  getCronStatus, getTableList, getLatestDigest, getDashboardData,
  type CronJobStatus, type TableInfo, type NewsDigestDetail, type DashboardData,
} from "../api/index"

type TagType = "success" | "danger" | "warning" | "info"

const notShowTables = ["ChatSession", "ChatMessage"]
const cronJobNameMap: Record<string, string> = {
  news_fetch: "新闻抓取",
  news_digest: "新闻消化",
  auto_prediction: "AI分析预测",
  quant_analysis: "量化分析",
}

const router = useRouter()
const cronJobs = ref<CronJobStatus[]>([])
const tables = ref<TableInfo[]>([])
const latestDigest = ref<NewsDigestDetail | null>(null)
const dashData = ref<DashboardData | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const techSentiment = computed(() => {
  if (!dashData.value) return { label: "—", type: "info" as TagType }
  const ind = dashData.value.indicators
  const signals = [
    ind.rsi14 != null && ind.rsi14 < 30,
    ind.stochK != null && ind.stochK < 20,
    ind.ao != null && ind.ao > 0,
    ind.mom10 != null && ind.mom10 > 0,
  ]
  const bearSignals = [
    ind.rsi14 != null && ind.rsi14 > 70,
    ind.stochK != null && ind.stochK > 80,
    ind.ao != null && ind.ao < 0,
    ind.mom10 != null && ind.mom10 < 0,
  ]
  const bull = signals.filter(Boolean).length
  const bear = bearSignals.filter(Boolean).length
  if (bull > bear + 1) return { label: "偏多", type: "success" as TagType }
  if (bear > bull + 1) return { label: "偏空", type: "danger" as TagType }
  return { label: "中性", type: "info" as TagType }
})

function sentimentType(s: string) { return s === "bullish" ? "warning" : s === "bearish" ? "success" : "info" }
function sentimentLabel(s: string) { return s === "bullish" ? "看涨美元" : s === "bearish" ? "看跌美元" : "中性" }
function directionText(d: string) { return d === "bullish" ? "看多" : d === "bearish" ? "看空" : "震荡" }

function formatTime(t: string | null) {
  if (!t) return "-"
  return new Date(t).toLocaleString("zh-CN")
}

function goToTable(name: string) {
  router.push({ path: "/database", query: { table: name } })
}

async function refresh() {
  try {
    const [crons, tbls] = await Promise.all([getCronStatus(), getTableList()])
    cronJobs.value = crons
    tables.value = tbls.filter((t) => !notShowTables.includes(t.name))
    try { const d = await getLatestDigest(); if (d) latestDigest.value = d } catch {}
    try { const d = await getDashboardData(); if (d) dashData.value = d } catch {}
  } catch {}
}

onMounted(() => {
  refresh()
  timer = setInterval(refresh, 15_000)
})

onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.overview { max-width: 1200px; }
.page-title { font-size: 20px; font-weight: 700; margin-bottom: 20px; color: #303133; }
.section { margin-bottom: 16px; }

.metric-card {
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.metric-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 14px;
}

.metric-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.tech-bg { background: #ecf5ff; }
.news-bg { background: #fef0f0; }
.pred-bg { background: #f0f9eb; }

.metric-body { display: flex; flex-direction: column; gap: 4px; }
.metric-label { font-size: 12px; color: #909399; }
.metric-empty { font-size: 12px; color: #c0c4cc; }

.direction-text { font-size: 16px; font-weight: 700; }
.direction-text.bullish { color: #67c23a; }
.direction-text.bearish { color: #f56c6c; }
.direction-text.neutral { color: #909399; }

.conf-badge {
  font-size: 11px;
  color: #909399;
  margin-left: 4px;
}

.status-card { border-radius: 10px; }

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.cron-mini {
  padding: 10px 12px;
  background: #fafbfc;
  border-radius: 8px;
  margin-bottom: 8px;
}

.cron-mini-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.cron-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.cron-dot.running { background: #e6a23c; animation: pulse 1.5s infinite; }
.cron-dot.idle { background: #67c23a; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.cron-name { font-size: 13px; font-weight: 600; color: #303133; }

.cron-mini-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #909399;
}

.cron-mini-time { font-size: 11px; color: #c0c4cc; margin-top: 2px; }

.table-stat {
  text-align: center;
  padding: 12px 8px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
  margin-bottom: 8px;
}

.table-stat:hover { background: #ecf5ff; }
.table-count { font-size: 20px; font-weight: 700; color: #303133; }
.table-name { font-size: 11px; color: #909399; margin-top: 2px; }
</style>
