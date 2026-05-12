<template>
  <div class="analysis">
    <div class="analysis-header">
      <h2 class="page-title">行情分析</h2>
      <el-radio-group v-model="currentInterval" size="small" @change="onIntervalChange">
        <el-radio-button value="1h">小时线</el-radio-button>
        <el-radio-button value="4h">4小时线</el-radio-button>
        <el-radio-button value="1d">日线</el-radio-button>
      </el-radio-group>
    </div>

    <div class="section">
      <MarketChart :series="marketStore.series" @interval-change="onIntervalChange" :hide-interval="true" />
    </div>

    <div class="charts-grid">
      <div class="section">
        <RateTrendChart />
      </div>
      <div class="section">
        <RatePredictionChart />
      </div>
    </div>

    <div class="section">
      <QuantSignalPanel />
    </div>

    <div class="section">
      <TechnicalSignalTables :indicators="marketStore.indicators" />
    </div>

    <!-- <div class="section" v-if="marketStore.newsDigest || finbertData">
      <el-card shadow="never" class="finbert-card">
        <template #header><span class="card-title">FinBERT 金融情感分析</span></template>
        <template v-if="finbertData">
          <div class="finbert-summary">
            <el-tag :type="finbertSentimentType" effect="dark">{{ finbertData.summary.dominantCn }}</el-tag>
            <span class="finbert-stats">共分析 {{ finbertData.summary.total }} 条</span>
          </div>
          <div class="finbert-bar">
            <div class="bar-segment positive" :style="{ width: finbertPositivePct + '%' }"></div>
            <div class="bar-segment neutral-seg" :style="{ width: finbertNeutralPct + '%' }"></div>
            <div class="bar-segment negative" :style="{ width: finbertNegativePct + '%' }"></div>
          </div>
          <div class="finbert-legend">
            <span class="legend-positive">积极 {{ finbertData.summary.positive }}</span>
            <span class="legend-neutral">中性 {{ finbertData.summary.neutral }}</span>
            <span class="legend-negative">消极 {{ finbertData.summary.negative }}</span>
          </div>
        </template>
        <template v-else>
          <el-button size="small" :loading="finbertLoading" @click="loadFinBert">运行 FinBERT 分析</el-button>
        </template>
      </el-card>
    </div> -->

    <div class="section">
      <IndicatorCharts :series="marketStore.series" :configs="marketStore.indicatorConfigs" />
    </div>

    <div class="section">
      <IndicatorCardGroup :indicators="marketStore.indicators" :configs="marketStore.indicatorConfigs" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { ElMessage } from "element-plus"
import { useMarketStore } from "../stores/market"
import { getFinBertStatus, runFinBertAnalysis } from "../api/index"
import type { FinBertAnalysis } from "../api/index"
import MarketChart from "../components/MarketChart.vue"
import IndicatorCharts from "../components/IndicatorCharts.vue"
import IndicatorCardGroup from "../components/IndicatorCardGroup.vue"
import QuantSignalPanel from "../components/QuantSignalPanel.vue"
import RateTrendChart from "../components/RateTrendChart.vue"
import RatePredictionChart from "../components/RatePredictionChart.vue"
import TechnicalSignalTables from "../components/TechnicalSignalTables.vue"

const marketStore = useMarketStore()
const currentInterval = ref(marketStore.interval || "1d")
const finbertData = ref<FinBertAnalysis | null>(null)
const finbertLoading = ref(false)

const finbertSentimentType = computed(() => {
  if (!finbertData.value) return "info"
  const d = finbertData.value.summary.dominant
  return d === "positive" ? "success" : d === "negative" ? "danger" : "info"
})
const finbertPositivePct = computed(() => {
  if (!finbertData.value) return 0
  return Math.round((finbertData.value.summary.positive / finbertData.value.summary.total) * 100)
})
const finbertNeutralPct = computed(() => {
  if (!finbertData.value) return 0
  return Math.round((finbertData.value.summary.neutral / finbertData.value.summary.total) * 100)
})
const finbertNegativePct = computed(() => {
  if (!finbertData.value) return 0
  return Math.round((finbertData.value.summary.negative / finbertData.value.summary.total) * 100)
})

async function loadFinBert() {
  finbertLoading.value = true
  try {
    finbertData.value = await runFinBertAnalysis()
  } catch {
    ElMessage.warning("FinBERT 服务未启动或分析失败")
  } finally {
    finbertLoading.value = false
  }
}

onMounted(async () => {
  if (!marketStore.series.length) {
    await marketStore.fetchDashboard()
  }
  getFinBertStatus().then((s) => { if (s.available) loadFinBert() }).catch(() => {})
})

async function onIntervalChange(interval: string) {
  currentInterval.value = interval
  await marketStore.setInterval(interval)
}
</script>

<style scoped>
.analysis-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-title { font-size: 16px; font-weight: 600; color: #1e293b; }
.section {
  margin-bottom: 20px;
}
.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}
@media (max-width: 1200px) {
  .charts-grid {
    grid-template-columns: 1fr;
  }
}
.charts-grid .section {
  margin-bottom: 0;
}
.card-title { font-size: 13px; font-weight: 600; color: #303133; }
.finbert-card { border-radius: 8px; }
.finbert-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.finbert-stats { font-size: 12px; color: #6b7280; }
.finbert-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: #f3f4f6;
  margin-bottom: 8px;
}
.bar-segment { height: 100%; transition: width 0.3s; }
.bar-segment.positive { background: #67c23a; }
.bar-segment.neutral-seg { background: #909399; }
.bar-segment.negative { background: #f56c6c; }
.finbert-legend {
  display: flex;
  gap: 16px;
  font-size: 12px;
}
.legend-positive { color: #67c23a; }
.legend-neutral { color: #909399; }
.legend-negative { color: #f56c6c; }
</style>
