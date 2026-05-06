<template>
  <el-card class="chart-card" shadow="never">
    <template #header>
      <el-space>
        <span class="card-title">技术指标图</span>
        <el-radio-group v-model="activeGroup" size="small">
          <el-radio-button v-for="g in groupTabs" :key="g.key" :value="g.key">
            <span v-if="g.color" class="group-dot" :style="{ background: g.color }" />
            {{ g.label }}
          </el-radio-button>
        </el-radio-group>
      </el-space>
    </template>
    <div v-if="series.length === 0" class="empty-chart">
      <el-empty description="暂无指标数据" :image-size="60" />
    </div>
    <template v-else>
      <div v-for="(chart, idx) in activeCharts" :key="chart.key" class="chart-section">
        <div v-if="activeCharts.length > 1" class="chart-section-label">{{ chart.label }}</div>
        <v-chart class="chart" :option="chart.option" autoresize />
      </div>
      <div v-if="activeCharts.length === 0" class="empty-chart">
        <el-empty description="该分组下暂无指标" :image-size="60" />
      </div>
    </template>
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
const activeGroup = ref("")

interface GroupTab {
  key: string
  label: string
  color: string | null
  sortOrder: number
  configs: IndicatorConfigInfo[]
}

const BUILTIN_TABS: Record<string, { key: string; label: string; dataKeys: string[]; chartType: string; thresholds: Record<string, any> }> = {
  RSI: { key: "rsi", label: "RSI(14)", dataKeys: ["rsi14"], chartType: "line", thresholds: { buyBelow: 30, sellAbove: 70 } },
  STOCH: { key: "stoch", label: "Stoch", dataKeys: ["stochK", "stochD"], chartType: "line", thresholds: { buyBelow: 20, sellAbove: 80 } },
  CCI: { key: "cci", label: "CCI(20)", dataKeys: ["cci20"], chartType: "line", thresholds: { buyBelow: -100, sellAbove: 100 } },
  ADX: { key: "adx", label: "ADX(14)", dataKeys: ["adx14", "plusDi14", "minusDi14"], chartType: "line", thresholds: { strongTrendAbove: 25 } },
  AO: { key: "ao", label: "AO", dataKeys: ["ao"], chartType: "bar", thresholds: {} },
  MOM: { key: "mom", label: "MOM(10)", dataKeys: ["mom10"], chartType: "line", thresholds: {} },
}

const COLORS = ["#5470c6", "#ee6666", "#73c0de", "#9a60b4", "#67c23a", "#e6a23c"]

const groupTabs = computed((): GroupTab[] => {
  const cfgs = props.configs ?? []
  const map = new Map<string, GroupTab>()

  for (const cfg of cfgs) {
    const gKey = cfg.groupId ?? cfg.category1 ?? "custom"
    const gLabel = cfg.groupName ?? CATEGORY_LABELS[cfg.category1 ?? "custom"] ?? cfg.category1 ?? "自定义"
    if (!map.has(gKey)) {
      map.set(gKey, {
        key: gKey,
        label: gLabel,
        color: cfg.groupColor,
        sortOrder: cfg.groupSortOrder ?? 999,
        configs: [],
      })
    }
    map.get(gKey)!.configs.push(cfg)
  }

  if (map.size === 0) {
    map.set("momentum", { key: "momentum", label: "动量指标", color: null, sortOrder: 0, configs: [] })
  }

  return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder)
})

const CATEGORY_LABELS: Record<string, string> = {
  momentum: "动量指标",
  trend: "趋势指标",
  volatility: "波动率指标",
  support_resist: "支撑阻力",
  custom: "自定义指标",
}

watch(groupTabs, (tabs) => {
  if (!tabs.some((t) => t.key === activeGroup.value) && tabs.length > 0) {
    activeGroup.value = tabs[0].key
  }
}, { immediate: true })

interface ChartDef {
  key: string
  label: string
  option: Record<string, any>
}

function buildChartOption(
  dates: string[],
  seriesData: { name: string; type: string; data: (number | null)[]; color: string; isBar?: boolean }[],
  thresholds: { val: number; color: string; name: string }[],
): Record<string, any> {
  const chartSeries: object[] = []

  for (const s of seriesData) {
    if (s.isBar) {
      chartSeries.push({
        name: s.name,
        type: "bar",
        data: s.data,
        itemStyle: {
          color: (params: { value: number }) => params.value >= 0 ? "#ef232a" : "#14b143",
        },
      })
    } else {
      chartSeries.push({
        name: s.name,
        type: "line",
        data: s.data.map((v) => (v == null ? null : parseFloat(v.toFixed(4)))),
        smooth: true,
        symbol: "none",
        lineStyle: { width: 1.5, color: s.color },
        itemStyle: { color: s.color },
      })
    }
  }

  for (const th of thresholds) {
    chartSeries.push({
      name: th.name,
      type: "line",
      data: Array(dates.length).fill(th.val),
      lineStyle: { type: "dashed", color: th.color, width: 1 },
      symbol: "none",
    })
  }

  return {
    backgroundColor: "#fff",
    tooltip: { trigger: "axis" },
    legend: { top: 4 },
    grid: { left: "8%", right: "4%", top: 36, bottom: 60 },
    xAxis: { type: "category", data: dates, axisLabel: { fontSize: 10 } },
    yAxis: { type: "value", scale: true, axisLabel: { fontSize: 10 } },
    dataZoom: [{ type: "inside", start: 30, end: 100 }, { type: "slider", start: 30, end: 100, height: 18, bottom: 4 }],
    series: chartSeries,
  }
}

const activeCharts = computed((): ChartDef[] => {
  const group = groupTabs.value.find((g) => g.key === activeGroup.value)
  if (!group) return []

  const dates = props.series.map((d) => d.tradeDate.slice(0, 10))
  const charts: ChartDef[] = []

  for (const cfg of group.configs) {
    const builtin = BUILTIN_TABS[cfg.indicatorType]
    const dataKeys = builtin?.dataKeys ?? cfg.dataKeys
    const chartType = builtin?.chartType ?? cfg.chartType
    const th = cfg.signalThresholds

    const seriesItems = dataKeys.map((key, i) => ({
      name: builtin
        ? (dataKeys.length > 1 ? key : (builtin.label))
        : (cfg.displayName || key),
      type: chartType,
      data: props.series.map((d) => {
        const v = d[key]
        return v == null ? null : parseFloat(Number(v).toFixed(4))
      }),
      color: COLORS[i % COLORS.length],
      isBar: chartType === "bar",
    }))

    const thresholds: { val: number; color: string; name: string }[] = []
    if (th?.buyBelow != null) thresholds.push({ val: th.buyBelow, color: "#67c23a", name: `${th.buyBelow}` })
    if (th?.sellAbove != null) thresholds.push({ val: th.sellAbove, color: "#f56c6c", name: `${th.sellAbove}` })
    if (th?.strongTrendAbove != null) thresholds.push({ val: th.strongTrendAbove, color: "#e6a23c", name: `${th.strongTrendAbove}` })

    charts.push({
      key: cfg.indicatorType,
      label: cfg.displayName || cfg.indicatorType,
      option: buildChartOption(dates, seriesItems, thresholds),
    })
  }

  return charts
})
</script>

<style scoped>
.chart-card { border-radius: 8px; }
.card-title { font-size: 13px; font-weight: 600; color: #303133; }
.chart { height: 220px; width: 100%; }
.empty-chart { height: 160px; display: flex; align-items: center; justify-content: center; }
.group-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  margin-right: 2px; vertical-align: middle;
}
.chart-section { margin-bottom: 8px; }
.chart-section:last-child { margin-bottom: 0; }
.chart-section-label {
  font-size: 11px; font-weight: 600; color: #909399;
  padding: 4px 0 2px 4px; border-left: 3px solid #409eff; margin-left: 4px;
}
</style>
