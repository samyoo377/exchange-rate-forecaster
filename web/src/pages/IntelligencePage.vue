<template>
  <div class="intelligence">
    <div class="page-header">
      <h2 class="page-title">情报站</h2>
      <el-button size="small" :loading="newsStore.triggering" @click="handleTrigger">
        生成最新摘要
      </el-button>
    </div>

    <div v-if="newsStore.loading" class="loading-state">
      <el-skeleton :rows="6" animated />
    </div>

    <div v-else-if="newsStore.error" style="margin-top:16px">
      <el-alert :title="newsStore.error" type="error" show-icon />
    </div>

    <div v-else-if="!digest" class="empty-state">
      <p>暂无情报数据，点击上方按钮生成最新摘要</p>
    </div>

    <template v-else>
      <div class="digest-card">
        <div class="digest-meta">
          <el-tag :type="sentimentType(digest.sentiment)" size="small" effect="dark">
            {{ sentimentLabel(digest.sentiment) }}
          </el-tag>
          <span class="digest-date">{{ formatDate(digest.createdAt) }}</span>
          <span class="digest-model">{{ digest.modelVersion }}</span>
        </div>
        <h3 class="digest-headline">{{ digest.headline }}</h3>
        <div class="digest-summary">{{ digest.summary }}</div>
      </div>

      <div class="factors-section" v-if="digest.keyFactors?.length">
        <h4 class="section-title">关键因子</h4>
        <div class="factors-grid">
          <div
            v-for="(factor, idx) in digest.keyFactors"
            :key="idx"
            class="factor-card"
            :class="'factor-' + factor.direction"
          >
            <div class="factor-header">
              <span class="factor-arrow">{{ directionArrow(factor.direction) }}</span>
              <span class="factor-name">{{ factor.factor }}</span>
            </div>
            <div class="factor-detail">{{ factor.detail }}</div>
          </div>
        </div>
      </div>

      <div class="news-section" v-if="rawItems.length">
        <h4 class="section-title">相关新闻 ({{ rawItems.length }})</h4>
        <div class="news-list">
          <div
            v-for="item in visibleItems"
            :key="item.id"
            class="news-item"
          >
            <el-tag size="small" effect="plain" class="news-source">{{ item.source }}</el-tag>
            <a :href="item.url" target="_blank" rel="noopener" class="news-title">{{ item.title }}</a>
            <span class="news-time" v-if="item.publishedAt">{{ formatDate(item.publishedAt) }}</span>
          </div>
          <el-button
            v-if="rawItems.length > showCount"
            text
            type="primary"
            size="small"
            @click="showCount = rawItems.length"
          >
            展开全部 {{ rawItems.length }} 条
          </el-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref } from "vue"
import { useNewsStore } from "../stores/news"
import { ElMessage } from "element-plus"

const newsStore = useNewsStore()
const digest = computed(() => newsStore.digest)
const showCount = ref(8)

interface RawItem {
  id: string
  source: string
  title: string
  url: string
  summary?: string
  publishedAt?: string
}

const rawItems = computed<RawItem[]>(() => {
  const d = digest.value as Record<string, unknown> | null
  return (d?.rawItems as RawItem[]) ?? []
})

const visibleItems = computed(() => rawItems.value.slice(0, showCount.value))

onMounted(() => newsStore.fetchDigest())

async function handleTrigger() {
  await newsStore.triggerRefresh()
  if (!newsStore.error) ElMessage.success("摘要生成完成")
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-CN")
}

function sentimentType(s: string) {
  if (s === "bullish") return "warning"
  if (s === "bearish") return "success"
  return "info"
}

function sentimentLabel(s: string) {
  if (s === "bullish") return "偏多"
  if (s === "bearish") return "偏空"
  return "中性"
}

function directionArrow(d: string) {
  if (d === "bullish") return "↑"
  if (d === "bearish") return "↓"
  return "→"
}
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.page-title { font-size: 16px; font-weight: 600; color: #1e293b; }
.loading-state { margin-top: 20px; }
.empty-state { text-align: center; padding: 60px 0; color: #94a3b8; font-size: 14px; }

.digest-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #edf2f7;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}
.digest-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.digest-date { font-size: 11px; color: #94a3b8; }
.digest-model { font-size: 11px; color: #cbd5e1; }
.digest-headline { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 14px; line-height: 1.5; }
.digest-summary {
  font-size: 13px;
  line-height: 1.8;
  color: #475569;
  border-left: 3px solid #2563eb;
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 0 8px 8px 0;
}

.section-title { font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 12px; }

.factors-section { margin-bottom: 24px; }
.factors-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.factor-card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #edf2f7;
  padding: 14px 16px;
  transition: box-shadow 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}
.factor-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); }
.factor-card.factor-bullish { border-left: 3px solid #f59e0b; }
.factor-card.factor-bearish { border-left: 3px solid #16a34a; }
.factor-card.factor-neutral { border-left: 3px solid #6b7280; }
.factor-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.factor-arrow { font-size: 14px; font-weight: 700; }
.factor-bullish .factor-arrow { color: #f59e0b; }
.factor-bearish .factor-arrow { color: #16a34a; }
.factor-neutral .factor-arrow { color: #6b7280; }
.factor-name { font-size: 13px; font-weight: 600; color: #1e293b; }
.factor-detail { font-size: 12px; color: #64748b; line-height: 1.5; }

.news-section { margin-bottom: 24px; }
.news-list {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #edf2f7;
  padding: 14px 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}
.news-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}
.news-item:last-of-type { border-bottom: none; }
.news-source { flex-shrink: 0; }
.news-title {
  flex: 1;
  font-size: 13px;
  color: #1e293b;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.15s;
}
.news-title:hover { color: #2563eb; }
.news-time { font-size: 11px; color: #94a3b8; flex-shrink: 0; }
</style>
