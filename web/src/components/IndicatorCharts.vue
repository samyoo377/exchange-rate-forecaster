<template>
  <el-card class="chart-card" shadow="never">
    <template #header>
      <el-space>
        <span class="card-title">技术指标图</span>
        <el-radio-group v-model="activeTab" size="small">
          <el-radio-button v-for="t in tabs" :key="t.key" :label="t.key">{{ t.label }}</el-radio-button>
        </el-radio-group>
      </el-space>
    </template>
    <div v-if="series.length === 0" class="empty-chart">
      <el-empty description="暂无指标数据" :image-size="60" />
    </div>
    <v-chart v-else class="chart" :option="chartOption" autoresize />
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue"
import VChart from "vue-echarts"
import { use } from "echarts/core"
import { LineChart, BarChart } from "echarts/charts"
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import type { OhlcBar } from "../types/index"
import type { IndicatorConfigInfo } from "../api/index"

use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer])

const props = defineProps<{ series: OhlcBar[]; configs?: IndicatorConfigInfo[] }>()
const activeTab = ref("rsi")

const BUILTIN_TABS = [
  { key: "rsi", label: "RSI" },
  { key: "stoch", label: "Stoch" },
  { key: "cci", label: "CCI" },
  { key: "adx", label: "ADX" },
  { key: "ao", label: "AO" },
  { key: "mom", label: "MOM" },
]

const tabs = computed(() => {
  const custom = (props.configs ?? [])
    .filter((c) => !c.isBuiltin)
    .map((c) => ({ key: c.indicatorType, label: c.displayName || c.indicatorType }))
  return [...BUILTIN_TABS, ...custom]
})

watch(tabs, (newTabs) => {
  if (!newTabs.some((t) => t.key === activeTab.value)) {
    activeTab.value = newTabs[0]?.key ?? "rsi"
  }
})

const COLORS = ["#5470c6", "#ee6666", "#73c0de", "#9a60b4", "#67c23a", "#e6a23c"]

const chartOption = computed(() => {
  const dates = props.series.map((d) => d.tradeDate.slice(0, 10))
  const tab = activeTab.value

  const buildLine = (name: string, data: (number | null | undefined)[], color: string) => ({
    name,
    type: "line" as const,
    data: data.map((v) => (v == null ? null : parseFloat(v.toFixed(4)))),
    smooth: true,
    symbol: "none",
    lineStyle: { width: 1.5, color },
    itemStyle: { color },
  })

  const threshold = (val: number, color: string, name: string) => ({
    type: "line" as const,
    data: Array(dates.length).fill(val),
    lineStyle: { type: "dashed" as const, color, width: 1 },
    symbol: "none",
    name,
  })

  const baseOption = {
    backgroundColor: "#fff",
    tooltip: { trigger: "axis" as const },
    legend: { top: 4 },
    grid: { left: "8%", right: "4%", top: 36, bottom: 60 },
    xAxis: { type: "category" as const, data: dates, axisLabel: { fontSize: 10 } },
    yAxis: { type: "value" as const, scale: true, axisLabel: { fontSize: 10 } },
    dataZoom: [{ type: "inside", start: 30, end: 100 }, { type: "slider", start: 30, end: 100, height: 18, bottom: 4 }],
    series: [] as object[],
  }

  if (tab === "rsi") {
    baseOption.series = [
      buildLine("RSI(14)", props.series.map((d) => d.rsi14), "#5470c6"),
      threshold(70, "#f56c6c", "超买70"),
      threshold(30, "#67c23a", "超卖30"),
    ]
  } else if (tab === "stoch") {
    baseOption.series = [
      buildLine("%K", props.series.map((d) => d.stochK), "#5470c6"),
      buildLine("%D", props.series.map((d) => d.stochD), "#ee6666"),
      threshold(80, "#f56c6c", "超买80"),
      threshold(20, "#67c23a", "超卖20"),
    ]
  } else if (tab === "cci") {
    baseOption.series = [
      buildLine("CCI(20)", props.series.map((d) => d.cci20), "#73c0de"),
      threshold(100, "#f56c6c", "+100"),
      threshold(-100, "#67c23a", "-100"),
    ]
  } else if (tab === "adx") {
    baseOption.series = [
      buildLine("ADX(14)", props.series.map((d) => d.adx14), "#5470c6"),
      buildLine("+DI", props.series.map((d) => d.plusDi14), "#67c23a"),
      buildLine("-DI", props.series.map((d) => d.minusDi14), "#f56c6c"),
      threshold(25, "#e6a23c", "趋势阈值25"),
    ]
  } else if (tab === "ao") {
    baseOption.series = [{
      name: "AO",
      type: "bar",
      data: props.series.map((d) => d.ao == null ? null : parseFloat(d.ao.toFixed(6))),
      itemStyle: {
        color: (params: { value: number }) => params.value >= 0 ? "#ef232a" : "#14b143",
      },
    }]
  } else if (tab === "mom") {
    baseOption.series = [buildLine("MOM(10)", props.series.map((d) => d.mom10), "#9a60b4")]
  } else {
    const config = (props.configs ?? []).find((c) => c.indicatorType === tab)
    if (config) {
      if (config.chartType === "bar") {
        baseOption.series = config.dataKeys.map((key, i) => ({
          name: config.displayName || key,
          type: "bar",
          data: props.series.map((d) => {
            const v = d[key]
            return v == null ? null : parseFloat(Number(v).toFixed(4))
          }),
          itemStyle: {
            color: (params: { value: number }) => params.value >= 0 ? "#ef232a" : "#14b143",
          },
        }))
      } else {
        baseOption.series = config.dataKeys.map((key, i) =>
          buildLine(config.displayName || key, props.series.map((d) => d[key]), COLORS[i % COLORS.length])
        )
      }
      const th = config.signalThresholds
      if (th?.buyBelow != null) baseOption.series.push(threshold(th.buyBelow, "#67c23a", `买入${th.buyBelow}`))
      if (th?.sellAbove != null) baseOption.series.push(threshold(th.sellAbove, "#f56c6c", `卖出${th.sellAbove}`))
    }
  }

  return baseOption
})
</script>

<style scoped>
.chart-card { border-radius: 8px; }
.card-title { font-size: 13px; font-weight: 600; color: #303133; }
.chart { height: 220px; width: 100%; }
.empty-chart { height: 160px; display: flex; align-items: center; justify-content: center; }
</style>
