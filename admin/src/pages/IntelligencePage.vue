<template>
  <div class="intelligence">
    <h2 class="page-title">情报站</h2>

    <el-card v-if="latestDigest" shadow="hover" class="digest-main">
      <div class="digest-top">
        <el-tag :type="sentimentType(latestDigest.sentiment)" effect="dark">
          {{ sentimentLabel(latestDigest.sentiment) }}
        </el-tag>
        <span class="digest-headline">{{ latestDigest.headline }}</span>
        <span class="digest-time">{{ formatTime(latestDigest.createdAt) }}</span>
      </div>

      <div class="digest-summary">{{ latestDigest.summary }}</div>

      <div v-if="latestDigest.keyFactors?.length" class="factors-section">
        <div class="section-label">关键因素</div>
        <div class="factors-grid">
          <div v-for="(f, i) in latestDigest.keyFactors" :key="i" class="factor-card">
            <div class="factor-top">
              <el-tag :type="sentimentType(f.direction)" size="small" effect="plain">
                {{ f.direction === 'bullish' ? '↑' : f.direction === 'bearish' ? '↓' : '→' }}
              </el-tag>
              <span class="factor-name">{{ f.factor }}</span>
              <span v-if="f.score != null" class="factor-score" :class="f.direction">
                {{ f.score > 0 ? '+' : '' }}{{ f.score.toFixed(2) }}
              </span>
            </div>
            <div class="factor-detail">{{ f.detail }}</div>
            <div v-if="f.confidence != null" class="factor-conf">
              <el-progress :percentage="Math.round(f.confidence * 100)" :stroke-width="4" :show-text="false"
                :color="f.confidence > 0.7 ? '#67c23a' : f.confidence > 0.4 ? '#e6a23c' : '#909399'" />
              <span class="conf-label">确信度 {{ Math.round(f.confidence * 100) }}%</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="latestDigest.rawItems?.length" class="news-section">
        <div class="section-label">相关新闻 ({{ latestDigest.rawItems.length }})</div>
        <div class="news-list">
          <div v-for="item in latestDigest.rawItems.slice(0, showAll ? 999 : 10)" :key="item.id" class="news-row"
            @click="openNews(item)">
            <el-tag size="small" type="info" effect="plain" class="news-source">{{ item.source }}</el-tag>
            <span class="news-title">{{ item.title }}</span>
            <span class="news-time">{{ formatShort(item.publishedAt) }}</span>
          </div>
        </div>
        <el-button v-if="latestDigest.rawItems.length > 10" size="small" text type="primary"
          @click="showAll = !showAll" style="margin-top: 6px">
          {{ showAll ? '收起' : `展开全部 ${latestDigest.rawItems.length} 条` }}
        </el-button>
      </div>
    </el-card>
    <el-empty v-else description="暂无情报数据" />

    <el-dialog v-model="dialogVisible" title="新闻详情" width="560px">
      <template v-if="selectedNews">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="标题"><strong>{{ selectedNews.title }}</strong></el-descriptions-item>
          <el-descriptions-item label="来源"><el-tag size="small" type="info">{{ selectedNews.source }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="时间">{{ formatTime(selectedNews.publishedAt) }}</el-descriptions-item>
          <el-descriptions-item label="链接">
            <el-link v-if="selectedNews.url?.startsWith('http')" type="primary" :href="selectedNews.url"
              target="_blank">打开原文</el-link>
            <span v-else>无</span>
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="selectedNews.summary" class="detail-summary">{{ selectedNews.summary }}</div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue"
import { getLatestDigest, type NewsDigestDetail } from "../api/index"

const latestDigest = ref<NewsDigestDetail | null>(null)
const showAll = ref(false)
const dialogVisible = ref(false)
const selectedNews = ref<NewsDigestDetail["rawItems"][0] | null>(null)

function sentimentType(s: string) { return s === "bullish" ? "warning" : s === "bearish" ? "success" : "info" }
function sentimentLabel(s: string) { return s === "bullish" ? "看涨美元" : s === "bearish" ? "看跌美元" : "中性" }

function formatTime(t: string | null) {
  if (!t) return "-"
  return new Date(t).toLocaleString("zh-CN")
}

function formatShort(t: string | null) {
  if (!t) return ""
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function openNews(item: NewsDigestDetail["rawItems"][0]) {
  selectedNews.value = item
  dialogVisible.value = true
}

onMounted(async () => {
  try {
    const digest = await getLatestDigest()
    if (digest) latestDigest.value = digest
  } catch { /* ok */ }
})
</script>

<style scoped>
.intelligence { max-width: 1000px; }
.page-title { font-size: 20px; font-weight: 700; margin-bottom: 20px; color: #303133; }

.digest-main { border-radius: 10px; }

.digest-top {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.digest-headline { font-size: 16px; font-weight: 700; color: #303133; }
.digest-time { font-size: 12px; color: #909399; margin-left: auto; }

.digest-summary {
  margin-top: 14px;
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin: 16px 0 10px;
}

.factors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.factor-card {
  padding: 10px 12px;
  background: #fafbfc;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}

.factor-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.factor-name { font-size: 13px; font-weight: 600; color: #303133; flex: 1; }
.factor-score { font-size: 12px; font-weight: 700; }
.factor-score.bullish { color: #e6a23c; }
.factor-score.bearish { color: #67c23a; }
.factor-score.neutral { color: #909399; }

.factor-detail { font-size: 12px; color: #606266; margin-top: 6px; line-height: 1.5; }

.factor-conf {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.factor-conf .el-progress { flex: 1; }
.conf-label { font-size: 11px; color: #909399; white-space: nowrap; }

.news-list { display: flex; flex-direction: column; gap: 2px; }

.news-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.news-row:hover { background: #ecf5ff; }
.news-source { flex-shrink: 0; }
.news-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #303133; }
.news-time { font-size: 11px; color: #c0c4cc; white-space: nowrap; }

.detail-summary {
  margin-top: 14px;
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  white-space: pre-wrap;
}
</style>
