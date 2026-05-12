<template>
  <el-card class="chart-card" shadow="never">
    <template #header>
      <div class="chart-header">
        <span class="card-title">USD/CNH 汇率趋势图</span>
        <el-radio-group v-model="queryType" size="small" @change="onTypeChange">
          <el-radio-button value="D">日线</el-radio-button>
          <el-radio-button value="W">周线</el-radio-button>
          <el-radio-button value="M">月线</el-radio-button>
        </el-radio-group>
      </div>
    </template>
    <div class="custom-legend">
      <el-tooltip
        v-for="item in legendItems"
        :key="item.name"
        :content="item.tooltip"
        placement="top"
        :show-after="300"
      >
        <span class="legend-item" :class="{ inactive: !item.active }" @click="toggleLegend(item.name)">
          <span class="legend-dot" :style="{ background: item.color, borderStyle: item.dashed ? 'dashed' : 'solid' }" />
          {{ item.name }}
        </span>
      </el-tooltip>
    </div>
    <div v-if="loading" class="chart-loading">
      <el-skeleton :rows="6" animated />
    </div>
    <div v-else-if="!data || data.data.length === 0" class="empty-chart">
      <el-empty description="暂无汇率数据" :image-size="60" />
    </div>
    <v-chart v-else class="chart" :option="chartOption" autoresize ref="chartRef" />
    <div v-if="data" class="rate-info">
      <el-tooltip content="当前最新的 USD/CNH 即期汇率报价" placement="top" :show-after="300">
        <span class="current-rate">当前汇率: <strong>{{ data.currentRate }}</strong></span>
      </el-tooltip>
      <span class="update-time">更新时间: {{ data.currentDateTime }}</span>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive } from "vue"
import VChart from "vue-echarts"
import { use } from "echarts/core"
import { LineChart } from "echarts/charts"
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import { getRateTrend } from "../api/index"
import type { RateTrendData } from "../api/index"
import { useMarketStore } from "../stores/market"

use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, MarkPointComponent, CanvasRenderer])

const loading = ref(false)
const data = ref<RateTrendData | null>(null)
const queryType = ref("M")
const chartRef = ref<InstanceType<typeof VChart> | null>(null)
const marketStore = useMarketStore()

const legendState = reactive<Record<string, boolean>>({
  "汇率": true,
  "MA5": true,
  "MA10": true,
  "轴枢点": true,
})

const legendItems = computed(() => [
  {
    name: "汇率",
    color: "#2563eb",
    dashed: false,
    active: legendState["汇率"],
    tooltip: "USD/CNH 实时汇率走势线，反映美元兑离岸人民币的价格变动",
  },
  {
    name: "MA5",
    color: "#f59e0b",
    dashed: true,
    active: legendState["MA5"],
    tooltip: "5日移动平均线：最近5个交易日的平均汇率，用于判断短期趋势方向",
  },
  {
    name: "MA10",
    color: "#10b981",
    dashed: true,
    active: legendState["MA10"],
    tooltip: "10日移动平均线：最近10个交易日的平均汇率，用于判断中期趋势方向",
  },
  {
    name: "轴枢点",
    color: "#909399",
    dashed: true,
    active: legendState["轴枢点"],
    tooltip: "轴枢点水平线（R3/R2/R1/P/S1/S2/S3），基于前期高低收盘价计算的支撑阻力位",
  },
])

function toggleLegend(name: string) {
  legendState[name] = !legendState[name]
  chartRef.value?.chart?.dispatchAction({
    type: "legendToggleSelect",
    name,
  })
}

async function fetchData() {
  loading.value = true
  try {
    data.value = await getRateTrend(queryType.value, 30)
  } catch (e) {
    console.error("获取汇率趋势失败:", e)
  } finally {
    loading.value = false
  }
}

function onTypeChange() {
  fetchData()
}

onMounted(fetchData)

const chartOption = computed(() => {
  if (!data.value) return {}
  const { data: points, ma5, ma10 } = data.value
  const dates = points.map((p) => p.date)
  const rates = points.map((p) => p.rate)

  const min = Math.min(...rates)
  const max = Math.max(...rates)
  const padding = (max - min) * 0.1

  const pivotMarkLines: any[] = []
  if (legendState["轴枢点"]) {
    const ind = marketStore.indicators
    const pivotLevels = [
      { value: ind.pivotR3, label: "R3", color: "#f56c6c" },
      { value: ind.pivotR2, label: "R2", color: "#e6a23c" },
      { value: ind.pivotR1, label: "R1", color: "#f0a020" },
      { value: ind.pivotPP, label: "P", color: "#909399" },
      { value: ind.pivotS1, label: "S1", color: "#85ce61" },
      { value: ind.pivotS2, label: "S2", color: "#67c23a" },
      { value: ind.pivotS3, label: "S3", color: "#529b2e" },
    ]
    for (const lv of pivotLevels) {
      if (lv.value != null) {
        pivotMarkLines.push({
          yAxis: lv.value,
          label: { formatter: `${lv.label} ${lv.value.toFixed(4)}`, position: "insideEndTop", fontSize: 10, color: lv.color },
          lineStyle: { color: lv.color, type: "dashed", width: 1 },
        })
      }
    }
  }

  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter(params: any[]) {
        const date = params[0]?.axisValue ?? ""
        let html = `<div style="font-weight:600;margin-bottom:4px">${date}</div>`
        for (const p of params) {
          if (p.value != null) {
            html += `<div>${p.marker} ${p.seriesName}: <b>${p.value.toFixed(4)}</b></div>`
          }
        }
        return html
      },
    },
    legend: { show: false },
    grid: { left: 60, right: 20, top: 20, bottom: 60 },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: { fontSize: 10, rotate: 30 },
    },
    yAxis: {
      type: "value",
      min: Math.floor((min - padding) * 1000) / 1000,
      max: Math.ceil((max + padding) * 1000) / 1000,
      axisLabel: { formatter: (v: number) => v.toFixed(4) },
      splitLine: { lineStyle: { type: "dashed", color: "#eee" } },
    },
    dataZoom: [
      { type: "inside", start: 0, end: 100 },
      { type: "slider", start: 0, end: 100, height: 20, bottom: 10 },
    ],
    series: [
      {
        name: "汇率",
        type: "line",
        data: rates,
        smooth: true,
        lineStyle: { width: 2, color: "#2563eb" },
        itemStyle: { color: "#2563eb" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(37,99,235,0.15)" },
              { offset: 1, color: "rgba(37,99,235,0)" },
            ],
          },
        },
        markPoint: {
          data: [
            { type: "max", name: "最高" },
            { type: "min", name: "最低" },
          ],
          symbolSize: 40,
          label: { fontSize: 10 },
        },
        markLine: pivotMarkLines.length > 0 ? {
          silent: true,
          symbol: "none",
          data: pivotMarkLines,
        } : undefined,
      },
      {
        name: "MA5",
        type: "line",
        data: ma5,
        smooth: true,
        lineStyle: { width: 1, color: "#f59e0b", type: "dashed" },
        itemStyle: { color: "#f59e0b" },
        symbol: "none",
      },
      {
        name: "MA10",
        type: "line",
        data: ma10,
        smooth: true,
        lineStyle: { width: 1, color: "#10b981", type: "dashed" },
        itemStyle: { color: "#10b981" },
        symbol: "none",
      },
    ],
  }
})
</script>

<style scoped>
.chart-card {
  border-radius: 12px;
}
.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.custom-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 0 8px;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s;
}
.legend-item:hover { opacity: 0.7; }
.legend-item.inactive { opacity: 0.35; text-decoration: line-through; }
.legend-dot {
  width: 14px;
  height: 3px;
  border-radius: 2px;
}
.chart {
  height: 360px;
  width: 100%;
}
.chart-loading {
  padding: 20px;
}
.empty-chart {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
}
.rate-info {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0 0;
  font-size: 12px;
  color: #6b7280;
}
.current-rate strong {
  color: #2563eb;
  font-size: 14px;
}
</style>
