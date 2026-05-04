<template>
  <div class="overview">
    <h2 class="page-title">系统概览</h2>

    <!-- Cron Status Cards -->
    <el-row :gutter="16" class="section">
      <el-col :span="12" v-for="job in cronJobs" :key="job.name">
        <el-card shadow="hover" class="cron-card">
          <template #header>
            <div class="card-header">
              <el-icon :color="job.running ? '#e6a23c' : '#67c23a'"><Timer /></el-icon>
              <span>{{ job.name === 'news_fetch' ? '新闻抓取' : '新闻消化' }}</span>
              <el-tag :type="job.running ? 'warning' : 'success'" size="small" style="margin-left:auto">
                {{ job.running ? '运行中' : '空闲' }}
              </el-tag>
            </div>
          </template>
          <div class="cron-body">
            <div class="countdown">
              <span class="countdown-label">距下次执行</span>
              <span class="countdown-value">{{ getCountdown(job) }}</span>
            </div>
            <el-descriptions :column="2" size="small" border>
              <el-descriptions-item label="Cron">{{ job.cron }}</el-descriptions-item>
              <el-descriptions-item label="上次结果">
                <el-tag v-if="job.lastResult" :type="job.lastResult === 'success' ? 'success' : 'danger'" size="small">
                  {{ job.lastResult }}
                </el-tag>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="上次运行">{{ formatTime(job.lastRunAt) }}</el-descriptions-item>
              <el-descriptions-item label="耗时">{{ job.lastDurationMs != null ? job.lastDurationMs + 'ms' : '-' }}</el-descriptions-item>
              <el-descriptions-item label="总运行">{{ job.totalRuns }} 次</el-descriptions-item>
              <el-descriptions-item label="失败">{{ job.totalErrors }} 次</el-descriptions-item>
            </el-descriptions>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Table Stats -->
    <h3 class="section-title">数据库表统计</h3>
    <el-row :gutter="12" class="section">
      <el-col :xs="12" :sm="8" :md="6" v-for="t in tables" :key="t.name">
        <el-card shadow="hover" class="stat-card" @click="goToTable(t.name)">
          <div class="stat-name">{{ t.name }}</div>
          <div class="stat-count">{{ t.count >= 0 ? t.count : 'N/A' }}</div>
          <div class="stat-label">条记录</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Latest Digest -->
    <h3 class="section-title">最新消息面摘要</h3>
    <el-card v-if="latestDigest" shadow="hover" class="section digest-card">
      <div class="digest-header">
        <el-tag :type="sentimentType(latestDigest.sentiment)" size="small">
          {{ sentimentLabel(latestDigest.sentiment) }}
        </el-tag>
        <span
          class="digest-headline clickable"
          @click="onHeadlineClick"
        >{{ latestDigest.headline }}</span>
        <el-icon class="headline-link-icon"><Link /></el-icon>
        <span class="digest-time">{{ formatTime(latestDigest.createdAt) }}</span>
      </div>

      <div class="digest-summary">{{ latestDigest.summary }}</div>

      <!-- Key Factors -->
      <div v-if="latestDigest.keyFactors?.length" class="digest-factors">
        <div class="factor-title">关键因素</div>
        <div class="factor-list">
          <div v-for="(f, i) in latestDigest.keyFactors" :key="i" class="factor-item">
            <el-tag :type="sentimentType(f.direction)" size="small" effect="plain">
              {{ f.direction === 'bullish' ? '↑' : f.direction === 'bearish' ? '↓' : '→' }}
            </el-tag>
            <span class="factor-name">{{ f.factor }}</span>
            <span class="factor-detail">{{ f.detail }}</span>
            <el-tag v-if="f.heat" size="small" type="danger" effect="light" style="margin-left:auto">
              热度 {{ f.heat }}
            </el-tag>
          </div>
        </div>
      </div>

      <!-- Related News Items -->
      <div v-if="latestDigest.rawItems?.length" class="digest-news">
        <div class="factor-title">相关新闻 ({{ latestDigest.rawItems.length }})</div>
        <div class="news-list">
          <div
            v-for="item in latestDigest.rawItems.slice(0, showAllNews ? 999 : 8)"
            :key="item.id"
            class="news-item"
            @click="openNewsDetail(item)"
          >
            <el-tag size="small" type="info" effect="plain" class="news-source">{{ item.source }}</el-tag>
            <span class="news-title">{{ item.title }}</span>
            <span class="news-time">{{ formatShortTime(item.publishedAt) }}</span>
            <el-icon class="news-arrow"><ArrowRight /></el-icon>
          </div>
        </div>
        <el-button
          v-if="latestDigest.rawItems.length > 8"
          size="small"
          text
          type="primary"
          @click="showAllNews = !showAllNews"
          style="margin-top: 4px"
        >
          {{ showAllNews ? '收起' : `展开全部 ${latestDigest.rawItems.length} 条` }}
        </el-button>
      </div>
    </el-card>
    <el-empty v-else description="暂无摘要数据" :image-size="40" />

    <!-- News Detail Dialog -->
    <el-dialog v-model="newsDialogVisible" title="新闻详情" width="600px" :close-on-click-modal="true">
      <template v-if="selectedNews">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="标题">
            <strong>{{ selectedNews.title }}</strong>
          </el-descriptions-item>
          <el-descriptions-item label="来源">
            <el-tag size="small" type="info">{{ selectedNews.source }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="分类">
            <el-tag v-if="selectedNews.category" size="small">{{ selectedNews.category }}</el-tag>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="发布时间">
            {{ selectedNews.publishedAt ? formatTime(selectedNews.publishedAt) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="原文链接">
            <template v-if="selectedNews.url && isValidUrl(selectedNews.url)">
              <el-link type="primary" :href="selectedNews.url" target="_blank" :underline="true">
                {{ selectedNews.url }}
              </el-link>
            </template>
            <span v-else>无外部链接</span>
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="selectedNews.summary" class="news-detail-content">
          <div class="detail-label">内容摘要</div>
          <div class="detail-text">{{ selectedNews.summary }}</div>
        </div>
      </template>
      <template #footer>
        <el-button @click="newsDialogVisible = false">关闭</el-button>
        <el-button
          v-if="selectedNews?.url && isValidUrl(selectedNews.url)"
          type="primary"
          @click="openExternal(selectedNews!.url)"
        >
          打开原文
        </el-button>
      </template>
    </el-dialog>

    <!-- Source Links Dialog -->
    <el-dialog v-model="sourcesDialogVisible" title="相关信源链接" width="560px">
      <div class="sources-list">
        <div
          v-for="item in headlineSources"
          :key="item.id"
          class="source-link-item"
          @click="openExternal(item.url)"
        >
          <el-tag size="small" type="info" effect="plain">{{ item.source }}</el-tag>
          <span class="source-link-title">{{ item.title }}</span>
          <span class="source-link-time">{{ formatShortTime(item.publishedAt) }}</span>
          <el-icon><Link /></el-icon>
        </div>
      </div>
      <template #footer>
        <el-button @click="sourcesDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- Server Info -->
    <h3 class="section-title">服务状态</h3>
    <el-descriptions :column="3" border size="small" class="section">
      <el-descriptions-item label="服务运行时间">{{ formatUptime(serverUptime) }}</el-descriptions-item>
      <el-descriptions-item label="数据刷新">
        <el-button size="small" type="primary" text @click="refresh">刷新数据</el-button>
      </el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue"
import { useRouter } from "vue-router"
import {
  getCronStatus, getTableList,
  getLatestDigest,
  type CronJobStatus, type TableInfo, type NewsDigestDetail,
} from "../api/index"

const notShowTables = ["ChatSession", "ChatMessage"]

const router = useRouter()
const cronJobs = ref<CronJobStatus[]>([])
const tables = ref<TableInfo[]>([])
const latestDigest = ref<NewsDigestDetail | null>(null)
const serverUptime = ref(0)
const showAllNews = ref(false)
const newsDialogVisible = ref(false)
const selectedNews = ref<NewsDigestDetail["rawItems"][0] | null>(null)
const sourcesDialogVisible = ref(false)
const headlineSources = ref<NewsDigestDetail["rawItems"]>([])

let timer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null
const now = ref(Date.now())

async function refresh() {
  try {
    const [crons, tbls] = await Promise.all([getCronStatus(), getTableList()])
    cronJobs.value = crons
    tables.value = tbls.filter(t => !notShowTables.includes(t.name))

    try {
      const digest = await getLatestDigest()
      if (digest) latestDigest.value = digest
    } catch { /* ok */ }

    try {
      const res = await fetch("/health")
      const json = await res.json()
      serverUptime.value = json?.data?.uptimeSeconds ?? 0
    } catch { /* ok */ }
  } catch { /* ok */ }
}

function sentimentType(s: string) {
  if (s === "bullish") return "warning"
  if (s === "bearish") return "success"
  return "info"
}

function sentimentLabel(s: string) {
  if (s === "bullish") return "看涨美元 ↑"
  if (s === "bearish") return "看跌美元 ↓"
  return "中性 →"
}

function openNewsDetail(item: NewsDigestDetail["rawItems"][0]) {
  selectedNews.value = item
  newsDialogVisible.value = true
}

function onHeadlineClick() {
  if (!latestDigest.value?.rawItems?.length) return
  const sources = latestDigest.value.rawItems.filter((item) => isValidUrl(item.url))
  if (sources.length === 0) return
  if (sources.length === 1) {
    openExternal(sources[0].url)
  } else {
    headlineSources.value = sources.slice(0, 20)
    sourcesDialogVisible.value = true
  }
}

function isValidUrl(url: string) {
  return url && (url.startsWith("http://") || url.startsWith("https://"))
}

function openExternal(url: string) {
  window.open(url, "_blank")
}

function getCountdown(job: CronJobStatus): string {
  if (!job.lastRunAt) return "等待首次运行"
  if (job.running) return "执行中..."
  const lastRun = new Date(job.lastRunAt).getTime()
  const nextRun = lastRun + job.intervalMs
  const diff = Math.max(0, nextRun - now.value)
  if (diff <= 0) return "即将执行"
  const s = Math.ceil(diff / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}分${sec.toString().padStart(2, "0")}秒` : `${sec}秒`
}

function formatTime(t: string | null): string {
  if (!t) return "-"
  return new Date(t).toLocaleString("zh-CN")
}

function formatShortTime(t: string | null): string {
  if (!t) return ""
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}小时${m}分钟`
}

function goToTable(name: string) {
  router.push({ path: "/database", query: { table: name } })
}

onMounted(() => {
  refresh()
  timer = setInterval(refresh, 10_000)
  countdownTimer = setInterval(() => { now.value = Date.now() }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<style scoped>
.page-title { font-size: 20px; font-weight: 700; margin-bottom: 16px; color: #303133; }
.section-title { font-size: 15px; font-weight: 600; margin: 20px 0 10px; color: #303133; }
.section { margin-bottom: 16px; }

.cron-card .card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.cron-body .countdown {
  text-align: center;
  padding: 12px 0;
}
.countdown-label { display: block; font-size: 12px; color: #909399; }
.countdown-value { display: block; font-size: 28px; font-weight: 700; color: #409eff; margin-top: 4px; }

.stat-card {
  text-align: center;
  cursor: pointer;
  transition: transform .2s;
  margin-bottom: 12px;
}
.stat-card:hover { transform: translateY(-2px); }
.stat-name { font-size: 12px; color: #909399; margin-bottom: 4px; }
.stat-count { font-size: 24px; font-weight: 700; color: #303133; }
.stat-label { font-size: 11px; color: #c0c4cc; }

/* Digest card */
.digest-card { padding: 0; }

.digest-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.digest-headline {
  font-weight: 700;
  font-size: 15px;
  color: #303133;
}

.digest-headline.clickable {
  cursor: pointer;
  transition: color 0.15s;
}

.digest-headline.clickable:hover {
  color: #409eff;
}

.headline-link-icon {
  font-size: 14px;
  color: #c0c4cc;
}

.digest-time {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
}

.digest-summary {
  margin-top: 12px;
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
  padding: 10px 14px;
  background: #f5f7fa;
  border-radius: 6px;
}

.digest-factors {
  margin-top: 14px;
}

.factor-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.factor-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.factor-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #fafbfc;
  border-radius: 4px;
  font-size: 12px;
}

.factor-name {
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
}

.factor-detail {
  color: #606266;
  flex: 1;
  min-width: 0;
}

.digest-news {
  margin-top: 14px;
}

.news-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.news-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
}

.news-item:hover {
  background: #ecf5ff;
}

.news-source {
  flex-shrink: 0;
}

.news-title {
  flex: 1;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.news-time {
  font-size: 11px;
  color: #c0c4cc;
  white-space: nowrap;
}

.news-arrow {
  color: #c0c4cc;
  flex-shrink: 0;
}

.news-detail-content {
  margin-top: 16px;
}

.detail-label {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.detail-text {
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  white-space: pre-wrap;
}

.sources-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.source-link-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
}

.source-link-item:hover {
  background: #ecf5ff;
}

.source-link-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #303133;
}

.source-link-time {
  font-size: 11px;
  color: #c0c4cc;
  white-space: nowrap;
}
</style>
