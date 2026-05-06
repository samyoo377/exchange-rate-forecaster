<template>
  <el-card class="pred-chart-card" shadow="never">
    <template #header>
      <div class="card-header">
        <span class="card-title">AI 预测时间线</span>
        <el-button size="small" text :loading="loading" @click="loadData">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </template>

    <div v-if="loading" v-loading="true" class="chart-placeholder" />
    <div v-else-if="predictions.length === 0" class="empty-state">
      暂无预测数据
    </div>
    <template v-else>
      <div ref="chartRef" class="pred-chart" />

      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-label">总预测</span>
          <span class="stat-val">{{ predictions.length }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">看涨</span>
          <span class="stat-val bullish">{{ bullishCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">看跌</span>
          <span class="stat-val bearish">{{ bearishCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">中性</span>
          <span class="stat-val neutral">{{ neutralCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">平均置信度</span>
          <span class="stat-val">{{ avgConfidence }}%</span>
        </div>
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue"
import * as echarts from "echarts"
import { getPredictionsTimeline, type PredictionTimelineItem } from "../api/index"

const props = defineProps<{ series?: any[] }>()

const chartRef = ref<HTMLElement | null>(null)
const predictions = ref<PredictionTimelineItem[]>([])
const loading = ref(false)
let chart: echarts.ECharts | null = null

const bullishCount = computed(() => predictions.value.filter((p) => p.direction === "bullish").length)
const bearishCount = computed(() => predictions.value.filter((p) => p.direction === "bearish").length)
const neutralCount = computed(() => predictions.value.filter((p) => p.direction === "neutral").length)
const avgConfidence = computed(() => {
  if (predictions.value.length === 0) return "0"
  const avg = predictions.value.reduce((s, p) => s + p.confidence, 0) / predictions.value.length
  return (avg * 100).toFixed(1)
})

async function loadData() {
  loading.value = true
  try {
    predictions.value = await getPredictionsTimeline("USDCNH", 30)
    await nextTick()
    renderChart()
  } finally {
    loading.value = false
  }
}

function renderChart() {
  if (!chartRef.value || predictions.value.length === 0) return
  if (!chart) chart = echarts.init(chartRef.value)

  const dates = predictions.value.map((p) => {
    const d = new Date(p.createdAt)
    return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  })

  const confidenceData = predictions.value.map((p) => (p.confidence * 100))
  const directionColors = predictions.value.map((p) =>
    p.direction === "bullish" ? "#f56c6c" : p.direction === "bearish" ? "#67c23a" : "#909399",
  )

  const markerData = predictions.value.map((p, i) => ({
    value: p.direction === "bullish" ? 1 : p.direction === "bearish" ? -1 : 0,
    itemStyle: { color: directionColors[i] },
  }))

  const klineDates = (props.series ?? []).map((s: any) => s.tradeDate)
  const klineClose = (props.series ?? []).map((s: any) => s.close)

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const idx = params[0]?.dataIndex ?? 0
        const p = predictions.value[idx]
        if (!p) return ""
        const dir = p.direction === "bullish" ? "看涨" : p.direction === "bearish" ? "看跌" : "中性"
        let html = `<b>${dates[idx]}</b><br/>方向: ${dir}<br/>置信度: ${(p.confidence * 100).toFixed(1)}%<br/>周期: ${p.horizon}`
        if (p.rationale) {
          try {
            const reasons = JSON.parse(p.rationale) as string[]
            if (reasons.length > 0) html += `<br/>依据: ${reasons[0]}`
          } catch { /* not json */ }
        }
        return html
      },
    },
    legend: { data: ["置信度", "方向信号"], top: 0, textStyle: { fontSize: 11 } },
    grid: [
      { left: 50, right: 20, top: 30, height: "40%" },
      { left: 50, right: 20, top: "58%", height: "30%" },
    ],
    xAxis: [
      { type: "category", data: dates, gridIndex: 0, boundaryGap: false, axisLabel: { fontSize: 10 } },
      { type: "category", data: dates, gridIndex: 1, boundaryGap: false, axisLabel: { show: false } },
    ],
    yAxis: [
      { type: "value", name: "置信度%", gridIndex: 0, min: 0, max: 100, splitNumber: 4 },
      { type: "value", name: "信号", gridIndex: 1, min: -1.5, max: 1.5, splitNumber: 2,
        axisLabel: { formatter: (v: number) => v === 1 ? "涨" : v === -1 ? "跌" : "中" } },
    ],
    series: [
      {
        name: "置信度",
        type: "line",
        data: confidenceData,
        xAxisIndex: 0,
        yAxisIndex: 0,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: "#409eff" },
        areaStyle: { color: "rgba(64,158,255,0.1)" },
      },
      {
        name: "方向信号",
        type: "bar",
        data: markerData,
        xAxisIndex: 1,
        yAxisIndex: 1,
        barWidth: "60%",
      },
    ],
    dataZoom: [{ type: "inside", xAxisIndex: [0, 1], start: 0, end: 100 }],
  }

  chart.setOption(option, true)
}

function handleResize() {
  chart?.resize()
}

watch(() => props.series, () => {
  if (predictions.value.length > 0) renderChart()
})

onMounted(() => {
  window.addEventListener("resize", handleResize)
  loadData()
})

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize)
  chart?.dispose()
})
</script>

<style scoped>
.pred-chart-card { border-radius: 8px; }
.card-header { display: flex; align-items: center; justify-content: space-between; }
.card-title { font-size: 13px; font-weight: 600; color: #303133; }
.pred-chart { height: 280px; width: 100%; }
.chart-placeholder { height: 280px; }
.empty-state {
  height: 200px; display: flex; align-items: center; justify-content: center;
  color: #c0c4cc; font-size: 13px;
}

.stats-row {
  display: flex; gap: 12px; padding: 8px 0 0;
  border-top: 1px solid #f0f2f5; margin-top: 8px;
}
.stat-item { display: flex; flex-direction: column; align-items: center; flex: 1; }
.stat-label { font-size: 11px; color: #909399; }
.stat-val { font-size: 16px; font-weight: 700; color: #303133; }
.stat-val.bullish { color: #f56c6c; }
.stat-val.bearish { color: #67c23a; }
.stat-val.neutral { color: #909399; }
</style>
