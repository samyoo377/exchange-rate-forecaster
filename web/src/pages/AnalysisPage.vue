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
      <IndicatorCharts :series="marketStore.series" :configs="marketStore.indicatorConfigs" />
    </div>

    <div class="section">
      <IndicatorCardGroup :indicators="marketStore.indicators" :configs="marketStore.indicatorConfigs" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue"
import { useMarketStore } from "../stores/market"
import MarketChart from "../components/MarketChart.vue"
import IndicatorCharts from "../components/IndicatorCharts.vue"
import IndicatorCardGroup from "../components/IndicatorCardGroup.vue"
import QuantSignalPanel from "../components/QuantSignalPanel.vue"
import RateTrendChart from "../components/RateTrendChart.vue"
import RatePredictionChart from "../components/RatePredictionChart.vue"

const marketStore = useMarketStore()
const currentInterval = ref(marketStore.interval || "1d")

onMounted(() => {
  if (!marketStore.series.length) {
    marketStore.fetchDashboard()
  }
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
</style>
