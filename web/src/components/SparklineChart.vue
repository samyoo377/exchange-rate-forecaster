<template>
  <div class="sparkline" ref="chartRef"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from "vue"
import * as echarts from "echarts"
import type { RateTrendData } from "../api/index"

const props = defineProps<{
  series?: { close: number; tradeDate: string }[]
  rateTrend?: RateTrendData | null
}>()

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!chartRef.value) return

  let dates: string[] = []
  let values: number[] = []

  if (props.rateTrend?.data?.length) {
    const recent = props.rateTrend.data.slice(-30)
    dates = recent.map(d => d.date)
    values = recent.map(d => d.rate)
  } else if (props.series?.length) {
    const recent = props.series.slice(-30)
    dates = recent.map(s => s.tradeDate)
    values = recent.map(s => s.close)
  } else {
    return
  }

  if (!chart) {
    chart = echarts.init(chartRef.value)
  }

  chart.setOption({
    grid: { top: 4, right: 4, bottom: 4, left: 4 },
    xAxis: { type: "category", data: dates, show: false },
    yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
    series: [{
      type: "line",
      data: values,
      smooth: true,
      symbol: "none",
      lineStyle: { width: 2, color: "#2563eb" },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: "rgba(37,99,235,0.15)" },
          { offset: 1, color: "rgba(37,99,235,0)" },
        ]),
      },
    }],
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const p = params[0]
        return `${p.name}<br/>${p.value.toFixed(4)}`
      },
    },
  })
}

onMounted(() => render())
watch(() => props.rateTrend, () => render(), { deep: true })
watch(() => props.series, () => render(), { deep: true })

onUnmounted(() => {
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.sparkline { width: 100%; height: 80px; }
</style>
