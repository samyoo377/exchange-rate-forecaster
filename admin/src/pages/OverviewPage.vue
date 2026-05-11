<template>
  <div class="overview">
    <h2 class="page-title">概览</h2>

    <el-row :gutter="16" class="section">
      <el-col :span="24">
        <PredictionPanel :prediction="dashData?.latestPrediction ?? null" />
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
import { ref, onMounted, onUnmounted } from "vue"
import { useRouter } from "vue-router"
import {
  getCronStatus, getTableList, getDashboardData,
  type CronJobStatus, type TableInfo, type DashboardData,
} from "../api/index"
import PredictionPanel from "../components/PredictionPanel.vue"

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
const dashData = ref<DashboardData | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

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
