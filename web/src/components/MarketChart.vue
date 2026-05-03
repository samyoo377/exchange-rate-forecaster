<template>
  <el-card class="chart-card" shadow="never">
    <template #header>
      <span class="card-title">行情 K 线图（USDCNH 日线）</span>
    </template>
    <div v-if="series.length === 0" class="empty-chart">
      <el-empty description="暂无行情数据" :image-size="60" />
    </div>
    <v-chart
      v-else
      class="chart"
      :option="chartOption"
      autoresize
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from "vue"
import VChart from "vue-echarts"
import { use } from "echarts/core"
import { CandlestickChart, LineChart, BarChart } from "echarts/charts"
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import type { OhlcBar } from "../types/index"

use([CandlestickChart, LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer])

const props = defineProps<{ series: OhlcBar[] }>()

const chartOption = computed(() => {
  const dates = props.series.map((d) => d.tradeDate.slice(0, 10))
  const ohlc = props.series.map((d) => [d.open, d.close, d.low, d.high])

  return {
    backgroundColor: "#fff",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
    },
    legend: { data: ["K线"], top: 4 },
    grid: { left: "8%", right: "4%", top: 36, bottom: 60 },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { fontSize: 11, formatter: (v: number) => v.toFixed(4) },
    },
    dataZoom: [
      { type: "inside", start: 30, end: 100 },
      { type: "slider", start: 30, end: 100, height: 20, bottom: 4 },
    ],
    series: [
      {
        name: "K线",
        type: "candlestick",
        data: ohlc,
        itemStyle: {
          color: "#ef232a",
          color0: "#14b143",
          borderColor: "#ef232a",
          borderColor0: "#14b143",
        },
      },
    ],
  }
})
</script>

<style scoped>
.chart-card { border-radius: 8px; }
.card-title { font-size: 13px; font-weight: 600; color: #303133; }
.chart { height: 300px; width: 100%; }
.empty-chart { height: 200px; display: flex; align-items: center; justify-content: center; }
</style>
