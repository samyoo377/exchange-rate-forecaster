<template>
  <div class="cron-page">
    <h2 class="page-title">定时任务管理</h2>

    <el-row :gutter="20">
      <el-col :span="12" v-for="job in cronJobs" :key="job.name">
        <el-card shadow="hover" class="job-card">
          <template #header>
            <div class="card-header">
              <el-icon size="20" :color="job.running ? '#e6a23c' : '#67c23a'">
                <Loading v-if="job.running" class="spin" />
                <Timer v-else />
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
            <el-button type="primary" :loading="triggering[job.name]" @click="trigger(job.name)">
              <el-icon>
                <VideoPlay />
              </el-icon>
              立即执行
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Execution Log -->
    <h3 class="section-title">最近执行日志</h3>
    <FilterableTable ref="taskLogRef" tableName="TaskRunLog" :columns="taskLogColumns" :initPageSize="10"
      :maxHeight="400">
      <template #status="{ row }">
        <el-tag
          :type="row.status === 'success' ? 'success' : row.status === 'running' ? 'warning' : row.status === 'aborted' ? 'info' : 'danger'"
          size="small">
          {{ row.status }}
        </el-tag>
      </template>
      <template #startedAt="{ row }">{{ formatTime(row.startedAt) }}</template>
      <template #finishedAt="{ row }">{{ formatTime(row.finishedAt) }}</template>
    </FilterableTable>



    <!-- ═══ AI Digest Logs ═══ -->
    <h3 class="section-title">AI 分析日志</h3>
    <el-table :data="digestLogs" v-loading="digestLogsLoading" stripe border size="small" style="width:100%"
      row-key="id">
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="digestStatusType(row.status)" size="small">{{ digestStatusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="开始时间" width="170">
        <template #default="{ row }">{{ formatTime(row.startedAt) }}</template>
      </el-table-column>
      <el-table-column label="耗时" width="90" align="center">
        <template #default="{ row }">{{ row.durationMs != null ? (row.durationMs / 1000).toFixed(1) + 's' : '-'
          }}</template>
      </el-table-column>
      <el-table-column label="标题" min-width="200">
        <template #default="{ row }">
          <template v-if="row.digest">
            <span class="digest-headline">{{ row.digest.headline }}</span>
          </template>
          <el-text v-else-if="row.errorMessage" type="danger" size="small">{{ row.errorMessage }}</el-text>
          <span v-else class="no-data">-</span>
        </template>
      </el-table-column>
      <el-table-column label="情绪" width="90" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.digest" :type="sentimentType(row.digest.sentiment)" size="small" effect="dark">
            {{ sentimentLabel(row.digest.sentiment) }}
          </el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130" align="center" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.digest" size="small" text type="primary" @click="showDigestDetail(row)">
            查看详情
          </el-button>
          <el-button v-if="row.status === 'running'" size="small" text type="danger" @click="handleAbort(row)">
            中断
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-row" v-if="digestLogsTotal > digestLogsPageSize">
      <el-pagination v-model:current-page="digestLogsPage" :page-size="digestLogsPageSize" :total="digestLogsTotal"
        layout="prev, pager, next" small @current-change="loadDigestLogs" />
    </div>

    <!-- Digest Detail Dialog -->
    <el-dialog v-model="digestDetailVisible" title="AI 分析详情" width="800px" destroy-on-close>
      <template v-if="digestDetailRow?.digest">
        <div class="detail-section">
          <div class="detail-header">
            <el-tag :type="sentimentType(digestDetailRow.digest.sentiment)" effect="dark" size="small">
              {{ sentimentLabel(digestDetailRow.digest.sentiment) }}
            </el-tag>
            <span class="detail-headline">{{ digestDetailRow.digest.headline }}</span>
            <el-tag type="info" size="small" style="margin-left: auto">{{ digestDetailRow.digest.modelVersion
              }}</el-tag>
          </div>

          <div class="detail-summary">{{ digestDetailRow.digest.summary }}</div>

          <!-- Key Factors -->
          <div class="detail-sub-title">关键因素</div>
          <div class="factors-list">
            <div v-for="(kf, i) in digestDetailRow.digest.keyFactors" :key="i" class="factor-item">
              <el-tag :type="factorDirType(kf.direction)" size="small" effect="dark" class="factor-dir">
                {{ factorDirLabel(kf.direction) }}
              </el-tag>
              <span class="factor-name">{{ kf.factor }}</span>
              <span v-if="kf.heat" class="factor-heat">🔥{{ kf.heat }}</span>
              <div class="factor-detail">{{ kf.detail }}</div>
            </div>
          </div>

          <!-- Input News Items -->
          <div class="detail-sub-title">
            消化的新闻 ({{ digestDetailRow.digest.rawItemCount }} 条)
            <el-button size="small" text type="primary" @click="newsListExpanded = !newsListExpanded"
              style="margin-left: 8px">
              {{ newsListExpanded ? '收起' : '展开' }}
            </el-button>
          </div>
          <el-collapse-transition>
            <div v-if="newsListExpanded" class="news-items-list">
              <div v-for="item in digestDetailRow.digest.rawItems" :key="item.id" class="news-item">
                <el-tag size="small" type="info" class="news-source">{{ item.source }}</el-tag>
                <a :href="item.url" target="_blank" rel="noopener" class="news-title">{{ item.title }}</a>
                <span v-if="item.publishedAt" class="news-time">{{ formatTime(item.publishedAt) }}</span>
              </div>
              <div v-if="digestDetailRow.digest.rawItems.length === 0" class="no-data">暂无新闻数据</div>
            </div>
          </el-collapse-transition>
        </div>
      </template>

      <el-descriptions v-if="digestDetailRow" :column="2" border size="small" style="margin-top: 16px">
        <el-descriptions-item label="状态">
          <el-tag :type="digestStatusType(digestDetailRow.status)" size="small">{{
            digestStatusText(digestDetailRow.status)
            }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="耗时">{{ digestDetailRow.durationMs != null ? (digestDetailRow.durationMs /
          1000).toFixed(1) + 's' : '-' }}</el-descriptions-item>
        <el-descriptions-item label="开始时间">{{ formatTime(digestDetailRow.startedAt) }}</el-descriptions-item>
        <el-descriptions-item label="结束时间">{{ formatTime(digestDetailRow.finishedAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="digestDetailRow.errorMessage" label="错误" :span="2">
          <el-text type="danger">{{ digestDetailRow.errorMessage }}</el-text>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <!-- News Fetch Logs -->
    <h3 class="section-title">新闻抓取日志</h3>
    <FilterableTable ref="fetchLogRef" tableName="NewsFetchLog" :columns="fetchLogColumns" :initPageSize="20"
      :maxHeight="500">
      <template #responseStatus="{ row }">
        <el-tag v-if="row.responseStatus" :type="row.responseStatus < 400 ? 'success' : 'danger'" size="small">{{
          row.responseStatus }}</el-tag>
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

    <!-- Fetch Detail Dialog -->
    <el-dialog v-model="detailVisible" title="抓取详情" width="700px">
      <el-descriptions v-if="detailRow" :column="1" border size="small">
        <el-descriptions-item label="来源">{{ detailRow.sourceName }}</el-descriptions-item>
        <el-descriptions-item label="请求 URL">{{ detailRow.requestUrl }}</el-descriptions-item>
        <el-descriptions-item label="请求方法">{{ detailRow.requestMethod }}</el-descriptions-item>
        <el-descriptions-item label="状态码">{{ detailRow.responseStatus ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="获取条数">{{ detailRow.fetchedCount }}</el-descriptions-item>
        <el-descriptions-item label="结果">{{ detailRow.success ? '成功' : '失败' }}</el-descriptions-item>
        <el-descriptions-item label="耗时">{{ detailRow.durationMs != null ? detailRow.durationMs + 'ms' : '-'
          }}</el-descriptions-item>
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
import {
  getCronStatus, triggerFetch, triggerDigest,
  getDigestLogs, abortTask,
  type CronJobStatus, type DigestLogEntry,
} from "../api/index"
import { ElMessage, ElMessageBox } from "element-plus"
import FilterableTable from "../components/FilterableTable.vue"
import type { ColumnDef } from "../components/FilterableTable.vue"

const cronJobs = ref<CronJobStatus[]>([])
const triggering = reactive<Record<string, boolean>>({})
const now = ref(Date.now())

const taskLogRef = ref<InstanceType<typeof FilterableTable> | null>(null)
const fetchLogRef = ref<InstanceType<typeof FilterableTable> | null>(null)

const detailVisible = ref(false)
const detailRow = ref<any>(null)

// Digest logs state
const digestLogs = ref<DigestLogEntry[]>([])
const digestLogsLoading = ref(false)
const digestLogsPage = ref(1)
const digestLogsPageSize = 10
const digestLogsTotal = ref(0)

const digestDetailVisible = ref(false)
const digestDetailRow = ref<DigestLogEntry | null>(null)
const newsListExpanded = ref(false)

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
  return name === "news_fetch" ? "新闻抓取 (5分钟)" : "新闻消化 (30分钟)"
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

// Digest log helpers
function digestStatusType(status: string) {
  if (status === "success") return "success"
  if (status === "running") return "warning"
  if (status === "aborted") return "info"
  return "danger"
}

function digestStatusText(status: string) {
  if (status === "success") return "成功"
  if (status === "running") return "运行中"
  if (status === "aborted") return "已中断"
  if (status === "failed") return "失败"
  return status
}

function sentimentType(sentiment: string) {
  if (sentiment === "bullish") return "warning"
  if (sentiment === "bearish") return "success"
  return "info"
}

function sentimentLabel(sentiment: string) {
  if (sentiment === "bullish") return "看涨美元"
  if (sentiment === "bearish") return "看跌美元"
  return "中性"
}

function factorDirType(dir: string) {
  if (dir === "bullish") return "warning"
  if (dir === "bearish") return "success"
  return "info"
}

function factorDirLabel(dir: string) {
  if (dir === "bullish") return "↑ 利多"
  if (dir === "bearish") return "↓ 利空"
  return "→ 中性"
}

function showDigestDetail(row: DigestLogEntry) {
  digestDetailRow.value = row
  newsListExpanded.value = false
  digestDetailVisible.value = true
}

async function handleAbort(row: DigestLogEntry) {
  try {
    await ElMessageBox.confirm("确定要中断当前运行的消化任务吗？", "中断任务", {
      type: "warning", confirmButtonText: "中断", cancelButtonText: "取消",
    })
    await abortTask("news_digest")
    ElMessage.success("中断请求已发送")
    await refresh()
    await loadDigestLogs()
  } catch { }
}

async function loadDigestLogs() {
  digestLogsLoading.value = true
  try {
    const result = await getDigestLogs(digestLogsPage.value, digestLogsPageSize)
    digestLogs.value = result.rows
    digestLogsTotal.value = result.total
  } catch {
    digestLogs.value = []
  } finally {
    digestLogsLoading.value = false
  }
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
    await loadDigestLogs()
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
  loadDigestLogs()
  refreshTimer = setInterval(() => {
    getCronStatus().then((c) => { cronJobs.value = c })
    taskLogRef.value?.refresh()
    fetchLogRef.value?.refresh()
    loadDigestLogs()
  }, 15000)
  tickTimer = setInterval(() => { now.value = Date.now() }, 1000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (tickTimer) clearInterval(tickTimer)
})
</script>

<style scoped>
.page-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #303133;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin: 24px 0 10px;
  color: #303133;
}

.section-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
  font-weight: 600;
}

.job-card .card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

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

.countdown-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.stats-row {
  margin-top: 12px;
}

.stat-box {
  text-align: center;
  background: #f5f7fa;
  border-radius: 6px;
  padding: 8px 0;
}

.stat-val {
  font-size: 18px;
  font-weight: 700;
  color: #303133;
}

.stat-val.err {
  color: #f56c6c;
}

.stat-lbl {
  font-size: 11px;
  color: #909399;
}

.actions {
  margin-top: 16px;
  text-align: center;
}

/* Digest logs */
.digest-headline {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
}

.no-data {
  color: #c0c4cc;
  font-size: 12px;
}

.pagination-row {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}

/* Digest detail dialog */
.detail-section {}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.detail-headline {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.detail-summary {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.8;
  color: #606266;
  margin-bottom: 16px;
}

.detail-sub-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
}

/* Factors */
.factors-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.factor-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}

.factor-dir {
  flex-shrink: 0;
}

.factor-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.factor-heat {
  font-size: 11px;
  color: #e6a23c;
}

.factor-detail {
  width: 100%;
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

/* News items */
.news-items-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 16px;
}

.news-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid #f0f2f5;
  flex-wrap: wrap;
}

.news-item:last-child {
  border-bottom: none;
}

.news-source {
  flex-shrink: 0;
}

.news-title {
  font-size: 12px;
  color: #409eff;
  text-decoration: none;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.news-title:hover {
  text-decoration: underline;
}

.news-time {
  font-size: 11px;
  color: #c0c4cc;
  flex-shrink: 0;
}

/* Fetch detail */
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
