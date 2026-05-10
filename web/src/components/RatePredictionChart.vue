<template>
  <el-card class="chart-card" shadow="never">
    <template #header>
      <div class="chart-header">
        <span class="card-title">USD/CNH 量化预测图</span>
        <div class="signal-badge" v-if="data?.quantSignal">
          <el-tooltip content="基于多因子量化模型综合判断的当前市场方向" placement="top" :show-after="300">
            <el-tag
              :type="regimeColor(data.quantSignal.regime)"
              size="small"
              effect="dark"
            >
              {{ regimeLabel(data.quantSignal.regime) }}
            </el-tag>
          </el-tooltip>
          <el-tooltip content="模型对当前预测结果的确信程度，越高表示信号越可靠" placement="top" :show-after="300">
            <span class="confidence-text">
              置信度: {{ (data.quantSignal.confidence * 100).toFixed(0) }}%
            </span>
          </el-tooltip>
        </div>
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
    <div v-else-if="!data || (!data.historical?.length && !data.predictions.length)" class="empty-chart">
      <el-empty description="暂无预测数据" :image-size="60" />
    </div>
    <v-chart v-else class="chart" :option="chartOption" autoresize ref="chartRef" />
    <div v-if="data?.quantSignal" class="quant-summary">
      <el-tooltip content="多因子综合评分，范围 -1 到 +1。正值看涨，负值看跌，绝对值越大信号越强" placement="top" :show-after="300">
        <div class="summary-item">
          <span class="label">综合评分</span>
          <span class="value" :class="scoreClass">{{ data.quantSignal.compositeScore.toFixed(2) }}</span>
        </div>
      </el-tooltip>
      <el-tooltip content="当前市场所处的状态阶段，由趋势强度和波动率共同决定" placement="top" :show-after="300">
        <div class="summary-item">
          <span class="label">市场状态</span>
          <span class="value">{{ regimeLabel(data.quantSignal.regime) }}</span>
        </div>
      </el-tooltip>
      <el-tooltip content="模型向前预测的天数，基于历史数据和量化信号推算未来走势" placement="top" :show-after="300">
        <div class="summary-item">
          <span class="label">预测天数</span>
          <span class="value">{{ data.predictions.length }} 天</span>
        </div>
      </el-tooltip>
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
  MarkLineComponent,
  VisualMapComponent,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import { getRatePrediction } from "../api/index"
import type { RatePredictionData } from "../api/index"

use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, VisualMapComponent, CanvasRenderer])

const loading = ref(false)
const data = ref<RatePredictionData | null>(null)
const chartRef = ref<InstanceType<typeof VChart> | null>(null)

const legendState = reactive<Record<string, boolean>>({
  "历史汇率": true,
  "预测汇率": true,
  "置信区间": true,
})

const legendItems = computed(() => [
  {
    name: "历史汇率",
    color: "#2563eb",
    dashed: false,
    active: legendState["历史汇率"],
    tooltip: "过去一段时间的真实 USD/CNH 汇率数据，作为预测的基准参考",
  },
  {
    name: "预测汇率",
    color: "#f59e0b",
    dashed: true,
    active: legendState["预测汇率"],
    tooltip: "量化模型预测的未来汇率走势，基于趋势、动量、波动率等多因子计算",
  },
  {
    name: "置信区间",
    color: "rgba(245,158,11,0.3)",
    dashed: false,
    active: legendState["置信区间"],
    tooltip: "预测值的可能波动范围，实际汇率大概率落在此区间内，区间越窄表示预测越确定",
  },
])

function toggleLegend(name: string) {
  legendState[name] = !legendState[name]
  const seriesMap: Record<string, string[]> = {
    "历史汇率": ["历史汇率"],
    "预测汇率": ["预测汇率"],
    "置信区间": ["置信上界", "置信下界辅助"],
  }
  const targets = seriesMap[name] ?? [name]
  for (const t of targets) {
    chartRef.value?.chart?.dispatchAction({
      type: "legendToggleSelect",
      name: t,
    })
  }
}

async function fetchData() {
  loading.value = true
  try {
    data.value = await getRatePrediction(30)
  } catch (e) {
    console.error("获取量化预测失败:", e)
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)

function regimeColor(regime: string) {
  if (regime === "bullish" || regime === "trending_up") return "success"
  if (regime === "bearish" || regime === "trending_down") return "danger"
  return "info"
}

function regimeLabel(regime: string) {
  const map: Record<string, string> = {
    bullish: "看涨",
    bearish: "看跌",
    neutral: "中性",
    trending_up: "上升趋势",
    trending_down: "下降趋势",
    ranging: "震荡",
  }
  return map[regime] ?? regime
}

const scoreClass = computed(() => {
  if (!data.value?.quantSignal) return ""
  const score = data.value.quantSignal.compositeScore
  if (score > 0.3) return "positive"
  if (score < -0.3) return "negative"
  return "neutral-score"
})

const chartOption = computed(() => {
  if (!data.value) return {}
  const { historical, predictions } = data.value

  const histDates = (historical ?? []).map((p) => p.date)
  const histRates = (historical ?? []).map((p) => p.rate)
  const predDates = predictions.map((p) => p.date)
  const predRates = predictions.map((p) => p.predicted)
  const upperBand = predictions.map((p) => p.upper)
  const lowerBand = predictions.map((p) => p.lower)

  const allDates = [...histDates, ...predDates]
  const allValues = [...histRates, ...predRates, ...upperBand, ...lowerBand]
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const padding = (max - min) * 0.15

  const dividerIndex = histDates.length - 1

  return {
    tooltip: {
      trigger: "axis",
      formatter(params: any[]) {
        const date = params[0]?.axisValue ?? ""
        let html = `<div style="font-weight:600;margin-bottom:4px">${date}</div>`
        for (const p of params) {
          if (p.value != null && p.seriesName !== "置信下界辅助") {
            const name = p.seriesName === "置信上界" ? "置信区间" : p.seriesName
            html += `<div>${p.marker} ${name}: <b>${Number(p.value).toFixed(4)}</b></div>`
          }
        }
        return html
      },
    },
    legend: { show: false },
    grid: { left: 60, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: "category",
      data: allDates,
      axisLabel: { fontSize: 10, rotate: 30 },
    },
    yAxis: {
      type: "value",
      min: Math.floor((min - padding) * 1000) / 1000,
      max: Math.ceil((max + padding) * 1000) / 1000,
      axisLabel: { formatter: (v: number) => v.toFixed(4) },
      splitLine: { lineStyle: { type: "dashed", color: "#eee" } },
    },
    series: [
      {
        name: "历史汇率",
        type: "line",
        data: [...histRates, ...Array(predDates.length).fill(null)],
        smooth: true,
        lineStyle: { width: 2, color: "#2563eb" },
        itemStyle: { color: "#2563eb" },
        symbol: "none",
        markLine: dividerIndex >= 0 ? {
          silent: true,
          data: [{ xAxis: dividerIndex }],
          lineStyle: { type: "dashed", color: "#9ca3af" },
          label: { formatter: "预测起点", fontSize: 10 },
        } : undefined,
      },
      {
        name: "预测汇率",
        type: "line",
        data: [...Array(histDates.length).fill(null), ...predRates],
        smooth: true,
        lineStyle: { width: 2, color: "#f59e0b", type: "dashed" },
        itemStyle: { color: "#f59e0b" },
        symbol: "circle",
        symbolSize: 4,
      },
      {
        name: "置信上界",
        type: "line",
        data: [...Array(histDates.length).fill(null), ...upperBand],
        smooth: true,
        lineStyle: { width: 0 },
        itemStyle: { color: "transparent" },
        symbol: "none",
        areaStyle: { color: "rgba(245,158,11,0.1)" },
      },
      {
        name: "置信下界辅助",
        type: "line",
        data: [...Array(histDates.length).fill(null), ...lowerBand],
        smooth: true,
        lineStyle: { width: 1, color: "rgba(245,158,11,0.3)", type: "dotted" },
        itemStyle: { color: "transparent" },
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
.signal-badge {
  display: flex;
  align-items: center;
  gap: 8px;
}
.confidence-text {
  font-size: 12px;
  color: #6b7280;
  cursor: default;
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
.quant-summary {
  display: flex;
  gap: 24px;
  padding: 12px 0 0;
  border-top: 1px solid #f3f4f6;
  margin-top: 12px;
}
.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: default;
}
.summary-item .label {
  font-size: 11px;
  color: #9ca3af;
}
.summary-item .value {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}
.summary-item .value.positive {
  color: #10b981;
}
.summary-item .value.negative {
  color: #ef4444;
}
.summary-item .value.neutral-score {
  color: #6b7280;
}
</style>
