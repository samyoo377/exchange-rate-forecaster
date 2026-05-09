<template>
  <div class="overview">
    <div class="overview-header">
      <div class="header-info">
        <span class="pair-label">USDCNH</span>
        <el-tag type="info" size="small" v-if="lastUpdatedAt">
          {{ formatDate(lastUpdatedAt) }}
        </el-tag>
        <el-tag type="warning" size="small" v-else>暂无数据</el-tag>
      </div>
      <el-space>
        <el-button size="small" :loading="marketStore.loading" @click="handleRefresh('excel')">
          刷新（Excel）
        </el-button>
        <el-button size="small" type="primary" :loading="marketStore.loading" @click="handleRefresh('alpha_vantage')">
          在线刷新
        </el-button>
      </el-space>
    </div>

    <el-alert v-if="marketStore.error" :title="marketStore.error" type="error" show-icon closable style="margin-bottom:16px" />

    <MarketSummaryBar
      :indicators="marketStore.indicators"
      :digest="marketStore.newsDigest"
      :prediction="marketStore.latestPrediction"
    />

    <el-row :gutter="20" class="overview-body">
      <el-col :xs="24" :md="15">
        <ChatPanel />
      </el-col>
      <el-col :xs="24" :md="9">
        <div class="sidebar-stack">
          <PredictionCard :prediction="marketStore.latestPrediction" />
          <div class="sparkline-card">
            <div class="card-title">近期走势</div>
            <SparklineChart :series="marketStore.series" />
          </div>
          <router-link to="/intelligence" class="news-entry" v-if="marketStore.newsDigest">
            <div class="news-entry-header">
              <el-tag :type="sentimentType(marketStore.newsDigest.sentiment)" size="small" effect="plain">
                {{ sentimentLabel(marketStore.newsDigest.sentiment) }}
              </el-tag>
              <span class="news-entry-time">{{ formatDate(marketStore.newsDigest.createdAt) }}</span>
            </div>
            <div class="news-entry-title">{{ marketStore.newsDigest.headline }}</div>
            <div class="news-entry-hint">查看完整情报 &rarr;</div>
          </router-link>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from "vue"
import { useMarketStore } from "../stores/market"
import ChatPanel from "../components/ChatPanel.vue"
import PredictionCard from "../components/PredictionCard.vue"
import MarketSummaryBar from "../components/MarketSummaryBar.vue"
import SparklineChart from "../components/SparklineChart.vue"
import { ElMessage } from "element-plus"

const marketStore = useMarketStore()
const lastUpdatedAt = computed(() => marketStore.lastUpdatedAt)

onMounted(() => marketStore.fetchDashboard())

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-CN")
}

async function handleRefresh(source: string) {
  await marketStore.refresh(source)
  if (!marketStore.error) ElMessage.success("数据刷新成功")
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
</script>

<style scoped>
.overview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  padding: 12px 16px;
  margin-bottom: 20px;
}
.header-info { display: flex; align-items: center; gap: 12px; }
.pair-label { font-size: 18px; font-weight: 700; color: #1e293b; }
.overview-body { margin-top: 20px; }
.sidebar-stack { display: flex; flex-direction: column; gap: 16px; }
.sparkline-card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  padding: 14px 16px;
}
.card-title { font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 8px; }
.news-entry {
  display: block;
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  padding: 14px 16px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s;
}
.news-entry:hover { border-color: #2563eb; }
.news-entry-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.news-entry-time { font-size: 11px; color: #94a3b8; }
.news-entry-title { font-size: 13px; font-weight: 500; color: #1e293b; line-height: 1.5; margin-bottom: 6px; }
.news-entry-hint { font-size: 11px; color: #2563eb; }
</style>
