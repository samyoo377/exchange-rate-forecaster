<template>
  <div ref="chartRef" class="radar-chart"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from "vue"
import * as echarts from "echarts"
import type { QuantSignalItem } from "../stores/quant"

const props = defineProps<{
  signals: QuantSignalItem[]
}>()

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

const SIGNAL_LABELS: Record<string, string> = {
  maCrossover: "MA交叉",
  bollingerBands: "布林带",
  macd: "MACD",
  supportResistance: "支撑阻力",
  volatility: "波动率",
  meanReversion: "均值回归",
  momentum: "动量",
}

function renderChart() {
  if (!chartRef.value || !props.signals.length) return

  if (!chart) {
    chart = echarts.init(chartRef.value)
  }

  const indicators = props.signals.map((s) => ({
    name: SIGNAL_LABELS[s.name] ?? s.name,
    max: 100,
    min: -100,
  }))

  const values = props.signals.map((s) => s.score)

  chart.setOption({
    radar: {
      indicator: indicators,
      shape: "polygon",
      radius: "65%",
      axisName: { color: "#64748b", fontSize: 11 },
      splitArea: { areaStyle: { color: ["#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1"] } },
      splitLine: { lineStyle: { color: "#e2e8f0" } },
    },
    series: [{
      type: "radar",
      data: [{
        value: values,
        name: "信号强度",
        areaStyle: { color: "rgba(59, 130, 246, 0.15)" },
        lineStyle: { color: "#3b82f6", width: 2 },
        itemStyle: { color: "#3b82f6" },
      }],
    }],
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        const data = params.data
        return data.value
          .map((v: number, i: number) => `${indicators[i].name}: ${v > 0 ? "+" : ""}${v.toFixed(0)}`)
          .join("<br/>")
      },
    },
  })
}

onMounted(() => {
  renderChart()
})

watch(() => props.signals, () => {
  renderChart()
}, { deep: true })

onBeforeUnmount(() => {
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.radar-chart {
  width: 100%;
  height: 260px;
}
</style>
