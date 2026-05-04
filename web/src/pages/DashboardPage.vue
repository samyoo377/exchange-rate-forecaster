<template>
  <div class="dashboard">
    <!-- header bar -->
    <el-row class="dashboard-header" align="middle" justify="space-between">
      <el-col :span="16">
        <el-space size="large">
          <span class="pair-label">USDCNH</span>
          <el-tag type="info" size="small" v-if="lastUpdatedAt">
            最近更新：{{ formatDate(lastUpdatedAt) }}
          </el-tag>
          <el-tag type="warning" size="small" v-else>暂无数据</el-tag>
        </el-space>
      </el-col>
      <el-col :span="8" style="text-align:right">
        <el-space>
          <el-button
            size="small"
            :loading="marketStore.loading"
            @click="handleRefresh('excel')"
          >
            <el-icon><Refresh /></el-icon> 刷新（Excel）
          </el-button>
          <el-button
            size="small"
            type="primary"
            :loading="marketStore.loading"
            @click="handleRefresh('alpha_vantage')"
          >
            <el-icon><Connection /></el-icon> 在线刷新
          </el-button>
        </el-space>
      </el-col>
    </el-row>

    <el-alert v-if="marketStore.error" :title="marketStore.error" type="error" show-icon closable style="margin-bottom:12px" />

    <!-- Market Summary Bar -->
    <MarketSummaryBar
      :indicators="marketStore.indicators"
      :digest="marketStore.newsDigest"
      :prediction="marketStore.latestPrediction"
    />

    <el-row :gutter="16" class="dashboard-body">
      <!-- left: chat panel -->
      <el-col :xs="24" :md="8">
        <ChatPanel />
      </el-col>

      <!-- right: charts + indicator cards -->
      <el-col :xs="24" :md="16">
        <el-row :gutter="12" style="margin-bottom:12px">
          <el-col :span="24">
            <MarketChart :series="marketStore.series" @interval-change="onIntervalChange" />
          </el-col>
        </el-row>
        <el-row :gutter="12" style="margin-bottom:12px">
          <el-col :span="24">
            <IndicatorCharts :series="marketStore.series" :configs="marketStore.indicatorConfigs" />
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :xs="24" :md="16">
            <IndicatorCardGroup :indicators="marketStore.indicators" :configs="marketStore.indicatorConfigs" />
          </el-col>
          <el-col :xs="24" :md="8">
            <PredictionCard :prediction="marketStore.latestPrediction" />
          </el-col>
        </el-row>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue"
import { useMarketStore } from "../stores/market"
import ChatPanel from "../components/ChatPanel.vue"
import MarketChart from "../components/MarketChart.vue"
import IndicatorCharts from "../components/IndicatorCharts.vue"
import IndicatorCardGroup from "../components/IndicatorCardGroup.vue"
import PredictionCard from "../components/PredictionCard.vue"
import MarketSummaryBar from "../components/MarketSummaryBar.vue"
import { ElMessage } from "element-plus"
import { computed } from "vue"

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

async function onIntervalChange(interval: string) {
  await marketStore.setInterval(interval)
}
</script>

<style scoped>
.dashboard { padding: 0; }
.dashboard-header {
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
}
.pair-label { font-size: 20px; font-weight: 700; color: #1a1a2e; }
.dashboard-body { }
</style>
