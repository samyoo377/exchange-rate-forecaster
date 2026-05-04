<template>
  <div class="cron-page">
    <h2 class="page-title">定时任务管理</h2>

    <el-row :gutter="20">
      <el-col :span="12" v-for="job in cronJobs" :key="job.name">
        <el-card shadow="hover" class="job-card">
          <template #header>
            <div class="card-header">
              <el-icon size="20" :color="job.running ? '#e6a23c' : '#67c23a'">
                <Loading v-if="job.running" class="spin" /><Timer v-else />
              </el-icon>
              <span class="job-name">{{ jobLabel(job.name) }}</span>
              <el-tag :type="statusType(job)" size="small" style="margin-left:auto">{{ statusText(job) }}</el-tag>
            </div>
          </template>

          <div class="countdown-section">
            <div class="countdown-ring" :style="{ '--progress': countdownProgress(job) }">
              <span class="countdown-text">{{ getCountdown(job) }}</span>
            </div>
            <div class="countdown-sub">距下次执行</div>
          </div>

          <el-row :gutter="8" class="stats-row">
            <el-col :span="8">
              <div class="stat-box">
                <div class="stat-val">{{ job.totalRuns }}</div>
                <div class="stat-lbl">总执行</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-box">
                <div class="stat-val err">{{ job.totalErrors }}</div>
                <div class="stat-lbl">失败</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-box">
                <div class="stat-val">{{ job.lastDurationMs != null ? job.lastDurationMs + 'ms' : '-' }}</div>
                <div class="stat-lbl">上次耗时</div>
              </div>
            </el-col>
          </el-row>

          <el-descriptions :column="1" size="small" border style="margin-top:12px">
            <el-descriptions-item label="Cron 表达式">{{ job.cron }}</el-descriptions-item>
            <el-descriptions-item label="间隔">每 {{ job.intervalMs / 60000 }} 分钟</el-descriptions-item>
            <el-descriptions-item label="上次运行">{{ formatTime(job.lastRunAt) }}</el-descriptions-item>
            <el-descriptions-item label="启动时间">{{ formatTime(job.startedAt) }}</el-descriptions-item>
            <el-descriptions-item v-if="job.lastError" label="错误信息">
              <el-text type="danger" size="small">{{ job.lastError }}</el-text>
            </el-descriptions-item>
          </el-descriptions>

          <div class="actions">
            <el-button
              type="primary"
              :loading="triggering[job.name]"
              @click="trigger(job.name)"
            >
              <el-icon><VideoPlay /></el-icon>
              立即执行
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Execution Log -->
    <h3 class="section-title">最近执行日志</h3>
    <FilterableTable
      ref="taskLogRef"
      tableName="TaskRunLog"
      :columns="taskLogColumns"
      :initPageSize="10"
      :maxHeight="400"
    >
      <template #status="{ row }">
        <el-tag :type="row.status === 'success' ? 'success' : row.status === 'running' ? 'warning' : 'danger'" size="small">
          {{ row.status }}
        </el-tag>
      </template>
      <template #startedAt="{ row }">{{ formatTime(row.startedAt) }}</template>
      <template #finishedAt="{ row }">{{ formatTime(row.finishedAt) }}</template>
    </FilterableTable>

    <!-- News Fetch Logs -->
    <h3 class="section-title">新闻抓取日志</h3>
    <FilterableTable
      ref="fetchLogRef"
      tableName="NewsFetchLog"
      :columns="fetchLogColumns"
      :initPageSize="20"
      :maxHeight="500"
    >
      <template #responseStatus="{ row }">
        <el-tag
          v-if="row.responseStatus"
          :type="row.responseStatus < 400 ? 'success' : 'danger'"
          size="small"
        >{{ row.responseStatus }}</el-tag>
        <span v-else>-</span>
      </template>
      <template #responseBody="{ row }">
        <span class="response-preview">{{ row.responseBody ? row.responseBody.slice(0, 100) : '-' }}</span>
      </template>
      <template #success="{ row }">
        <el-tag :type="row.success ? 'success' : 'danger'" size="small">
          {{ row.success ? '成功' : '失败' }}
        </el-tag>
      </template>
      <template #durationMs="{ row }">
        {{ row.durationMs != null ? row.durationMs + 'ms' : '-' }}
      </template>
      <template #startedAt="{ row }">{{ formatTime(row.startedAt) }}</template>
      <template #_detail="{ row }">
        <el-button size="small" text type="primary" @click="showFetchDetail(row)">查看</el-button>
      </template>
    </FilterableTable>

    <!-- Detail Dialog -->
    <el-dialog v-model="detailVisible" title="抓取详情" width="700px">
      <el-descriptions v-if="detailRow" :column="1" border size="small">
        <el-descriptions-item label="来源">{{ detailRow.sourceName }}</el-descriptions-item>
        <el-descriptions-item label="请求 URL">{{ detailRow.requestUrl }}</el-descriptions-item>
        <el-descriptions-item label="请求方法">{{ detailRow.requestMethod }}</el-descriptions-item>
        <el-descriptions-item label="状态码">{{ detailRow.responseStatus ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="获取条数">{{ detailRow.fetchedCount }}</el-descriptions-item>
        <el-descriptions-item label="结果">{{ detailRow.success ? '成功' : '失败' }}</el-descriptions-item>
        <el-descriptions-item label="耗时">{{ detailRow.durationMs != null ? detailRow.durationMs + 'ms' : '-' }}</el-descriptions-item>
        <el-descriptions-item label="开始时间">{{ formatTime(detailRow.startedAt) }}</el-descriptions-item>
        <el-descriptions-item label="结束时间">{{ formatTime(detailRow.finishedAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="detailRow.error" label="错误信息">
          <el-text type="danger">{{ detailRow.error }}</el-text>
        </el-descriptions-item>
      </el-descriptions>
      <div v-if="detailRow?.responseBody" style="margin-top:12px">
        <div class="section-label">响应内容</div>
        <pre class="response-body">{{ detailRow.responseBody }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from "vue"
import { getCronStatus, triggerFetch, triggerDigest, type CronJobStatus } from "../api/index"
import { ElMessage } from "element-plus"
import FilterableTable from "../components/FilterableTable.vue"
import type { ColumnDef } from "../components/FilterableTable.vue"

const cronJobs = ref<CronJobStatus[]>([])
const triggering = reactive<Record<string, boolean>>({})
const now = ref(Date.now())

const taskLogRef = ref<InstanceType<typeof FilterableTable> | null>(null)
const fetchLogRef = ref<InstanceType<typeof FilterableTable> | null>(null)

const detailVisible = ref(false)
const detailRow = ref<any>(null)

let refreshTimer: ReturnType<typeof setInterval> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null

const taskLogColumns: ColumnDef[] = [
  { prop: "taskType", label: "类型", width: 140 },
  { prop: "status", label: "状态", width: 100 },
  { prop: "startedAt", label: "开始", width: 180 },
  { prop: "finishedAt", label: "结束", width: 180 },
  { prop: "errorMessage", label: "错误" },
]

const fetchLogColumns: ColumnDef[] = [
  { prop: "sourceName", label: "来源", width: 140 },
  { prop: "requestUrl", label: "请求URL", minWidth: 200 },
  { prop: "responseStatus", label: "状态码", width: 80, align: "center" },
  { prop: "fetchedCount", label: "获取条数", width: 90, align: "center" },
  { prop: "responseBody", label: "响应内容", minWidth: 180 },
  { prop: "success", label: "结果", width: 70, align: "center" },
  { prop: "durationMs", label: "耗时", width: 80, align: "center" },
  { prop: "startedAt", label: "时间", width: 180 },
  { prop: "error", label: "错误", minWidth: 120 },
  { prop: "_detail", label: "详情", width: 70, align: "center", filterable: false, sortable: false },
]

function jobLabel(name: string) {
  return name === "news_fetch" ? "新闻抓取 (1分钟)" : "新闻消化 (30分钟)"
}

function statusType(job: CronJobStatus) {
  if (job.running) return "warning"
  if (job.lastResult === "error") return "danger"
  return "success"
}

function statusText(job: CronJobStatus) {
  if (job.running) return "运行中"
  if (!job.lastResult) return "待运行"
  return job.lastResult === "success" ? "正常" : "异常"
}

function getCountdown(job: CronJobStatus): string {
  if (job.running) return "..."
  if (!job.nextRunAt) return "--:--"
  const diff = Math.max(0, new Date(job.nextRunAt).getTime() - now.value)
  const s = Math.ceil(diff / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
}

function countdownProgress(job: CronJobStatus): string {
  if (job.running || !job.nextRunAt) return "0"
  const nextRun = new Date(job.nextRunAt).getTime()
  const remaining = nextRun - now.value
  const ratio = Math.min(1, Math.max(0, 1 - remaining / job.intervalMs))
  return String(ratio)
}

function formatTime(t: string | null): string {
  if (!t) return "-"
  return new Date(t).toLocaleString("zh-CN")
}

function showFetchDetail(row: any) {
  detailRow.value = row
  detailVisible.value = true
}

async function trigger(name: string) {
  triggering[name] = true
  try {
    if (name === "news_fetch") {
      await triggerFetch()
      ElMessage.success("新闻抓取已触发")
    } else {
      await triggerDigest()
      ElMessage.success("新闻消化已触发")
    }
    await refresh()
  } catch (e: any) {
    ElMessage.error(e.message)
  } finally {
    triggering[name] = false
  }
}

async function refresh() {
  cronJobs.value = await getCronStatus()
  taskLogRef.value?.refresh()
  fetchLogRef.value?.refresh()
}

onMounted(() => {
  getCronStatus().then((c) => { cronJobs.value = c })
  refreshTimer = setInterval(() => {
    getCronStatus().then((c) => { cronJobs.value = c })
    taskLogRef.value?.refresh()
    fetchLogRef.value?.refresh()
  }, 15000)
  tickTimer = setInterval(() => { now.value = Date.now() }, 1000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (tickTimer) clearInterval(tickTimer)
})
</script>

<style scoped>
.page-title { font-size: 20px; font-weight: 700; margin-bottom: 16px; color: #303133; }
.section-title { font-size: 15px; font-weight: 600; margin: 24px 0 10px; color: #303133; }
.section-label { font-size: 12px; color: #909399; margin-bottom: 6px; font-weight: 600; }

.job-card .card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.countdown-section {
  text-align: center;
  padding: 16px 0 8px;
}

.countdown-ring {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(#409eff calc(var(--progress) * 360deg), #f0f2f5 0deg);
  position: relative;
}

.countdown-ring::before {
  content: '';
  position: absolute;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #fff;
}

.countdown-text {
  position: relative;
  z-index: 1;
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  font-variant-numeric: tabular-nums;
}

.countdown-sub { font-size: 12px; color: #909399; margin-top: 4px; }

.stats-row { margin-top: 12px; }

.stat-box {
  text-align: center;
  background: #f5f7fa;
  border-radius: 6px;
  padding: 8px 0;
}

.stat-val { font-size: 18px; font-weight: 700; color: #303133; }
.stat-val.err { color: #f56c6c; }
.stat-lbl { font-size: 11px; color: #909399; }

.actions {
  margin-top: 16px;
  text-align: center;
}

.response-body {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.response-preview {
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}
</style>
