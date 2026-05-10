<template>
  <div class="history">
    <div class="page-header">
      <h2 class="page-title">回顾</h2>
      <div class="header-actions">
        <el-select v-model="statsDays" size="small" style="width:100px" @change="loadStats">
          <el-option :value="7" label="近7天" />
          <el-option :value="14" label="近14天" />
          <el-option :value="30" label="近30天" />
          <el-option :value="60" label="近60天" />
        </el-select>
        <el-button size="small" @click="refresh">刷新</el-button>
      </div>
    </div>

    <!-- Stats Overview -->
    <div class="stats-grid" v-if="stats">
      <div class="stat-card">
        <div class="stat-number">{{ stats.total }}</div>
        <div class="stat-label">总预测数</div>
      </div>
      <div class="stat-card bullish">
        <div class="stat-number">{{ stats.bullish }}</div>
        <div class="stat-label">看多</div>
        <div class="stat-pct">{{ pct(stats.bullish, stats.total) }}</div>
      </div>
      <div class="stat-card bearish">
        <div class="stat-number">{{ stats.bearish }}</div>
        <div class="stat-label">看空</div>
        <div class="stat-pct">{{ pct(stats.bearish, stats.total) }}</div>
      </div>
      <div class="stat-card neutral">
        <div class="stat-number">{{ stats.neutral }}</div>
        <div class="stat-label">震荡</div>
        <div class="stat-pct">{{ pct(stats.neutral, stats.total) }}</div>
      </div>
      <div class="stat-card confidence">
        <div class="stat-number">{{ (stats.avgConfidence * 100).toFixed(1) }}%</div>
        <div class="stat-label">平均置信度</div>
      </div>
      <div class="stat-card high-conf">
        <div class="stat-number">{{ stats.highConfidenceCount }}</div>
        <div class="stat-label">高置信度 (≥70%)</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="charts-row">
      <div class="chart-card trend-chart">
        <div class="chart-title">每日预测趋势</div>
        <div ref="trendChartRef" class="chart-body" />
      </div>
      <div class="chart-card conf-chart">
        <div class="chart-title">置信度走势</div>
        <div ref="confChartRef" class="chart-body" />
      </div>
    </div>

    <!-- Prediction Timeline Chart -->
    <div class="section">
      <PredictionChartPanel :series="marketStore.series" />
    </div>

    <!-- Filters + Table -->
    <div class="table-card">
      <div class="table-filters">
        <el-select v-model="filterDirection" placeholder="方向" clearable size="small" style="width:90px" @change="load(1)">
          <el-option value="bullish" label="看多" />
          <el-option value="bearish" label="看空" />
          <el-option value="neutral" label="震荡" />
        </el-select>
        <el-select v-model="filterHorizon" placeholder="周期" clearable size="small" style="width:90px" @change="load(1)">
          <el-option value="T+1" label="T+1" />
          <el-option value="T+2" label="T+2" />
          <el-option value="T+3" label="T+3" />
        </el-select>
        <el-date-picker
          v-model="filterDateRange"
          type="daterange"
          size="small"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          value-format="YYYY-MM-DD"
          style="width:220px"
          @change="load(1)"
        />
      </div>

      <el-table :data="list" v-loading="loading" stripe size="small">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand-content">
              <div class="expand-section" v-if="row.rationale?.length">
                <div class="expand-label">完整依据</div>
                <ul class="rationale-list">
                  <li v-for="r in row.rationale" :key="r">{{ r }}</li>
                </ul>
              </div>
              <div class="expand-section" v-if="row.riskNotes?.length">
                <div class="expand-label">风险提示</div>
                <ul class="rationale-list risk">
                  <li v-for="r in row.riskNotes" :key="r">{{ r }}</li>
                </ul>
              </div>
              <div class="expand-section" v-if="row.userQuery">
                <div class="expand-label">触发查询</div>
                <p class="query-text">{{ row.userQuery }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="时间" width="170">
          <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="horizon" label="周期" width="70" />
        <el-table-column prop="direction" label="方向" width="100">
          <template #default="{ row }">
            <el-tag :type="dirType(row.direction)" size="small">{{ dirLabel(row.direction) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="confidence" label="置信度" width="120">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.round(row.confidence * 100)"
              :stroke-width="6"
              :show-text="true"
              :color="confidenceColor(row.confidence)"
              style="width:90px"
            />
          </template>
        </el-table-column>
        <el-table-column prop="modelVersion" label="模型" width="120" />
        <el-table-column label="依据摘要" min-width="240">
          <template #default="{ row }">
            <span class="rationale-preview">{{ row.rationale?.slice(0, 2).join('；') }}</span>
            <span v-if="row.rationale?.length > 2" class="more"> +{{ row.rationale.length - 2 }}</span>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="load"
        style="margin-top:16px"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from "vue"
import { useMarketStore } from "../stores/market"
import { getPredictionHistory, getPredictionStats, type PredictionStats } from "../api/index"
import type { PredictionResult } from "../types/index"
import PredictionChartPanel from "../components/PredictionChartPanel.vue"
import * as echarts from "echarts"

const marketStore = useMarketStore()

const list = ref<PredictionResult[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const stats = ref<PredictionStats | null>(null)
const statsDays = ref(30)

const filterDirection = ref("")
const filterHorizon = ref("")
const filterDateRange = ref<[string, string] | null>(null)

const trendChartRef = ref<HTMLElement | null>(null)
const confChartRef = ref<HTMLElement | null>(null)
let trendChart: echarts.ECharts | null = null
let confChart: echarts.ECharts | null = null

function pct(n: number, total: number) {
  if (!total) return "0%"
  return `${((n / total) * 100).toFixed(0)}%`
}

async function loadStats() {
  try {
    stats.value = await getPredictionStats("USDCNH", statsDays.value)
    await nextTick()
    renderCharts()
  } catch {
    // non-critical
  }
}

async function load(p = 1) {
  loading.value = true
  page.value = p
  try {
    const filters: Record<string, string> = {}
    if (filterDirection.value) filters.direction = filterDirection.value
    if (filterHorizon.value) filters.horizon = filterHorizon.value
    if (filterDateRange.value) {
      filters.dateFrom = filterDateRange.value[0]
      filters.dateTo = filterDateRange.value[1]
    }
    const res = await getPredictionHistory("USDCNH", p, pageSize, filters)
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

function refresh() {
  load(1)
  loadStats()
}

function renderCharts() {
  if (!stats.value) return
  renderTrendChart()
  renderConfChart()
}

function renderTrendChart() {
  if (!trendChartRef.value || !stats.value) return
  if (!trendChart) {
    trendChart = echarts.init(trendChartRef.value)
  }
  const trend = stats.value.recentTrend
  trendChart.setOption({
    tooltip: { trigger: "axis" },
    legend: { data: ["看多", "看空", "震荡"], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 10, right: 16, bottom: 36, left: 36 },
    xAxis: {
      type: "category",
      data: trend.map((t) => t.date.slice(5)),
      axisLabel: { fontSize: 10 },
    },
    yAxis: { type: "value", minInterval: 1, axisLabel: { fontSize: 10 } },
    series: [
      { name: "看多", type: "bar", stack: "total", data: trend.map((t) => t.bullish), itemStyle: { color: "#16a34a" } },
      { name: "看空", type: "bar", stack: "total", data: trend.map((t) => t.bearish), itemStyle: { color: "#dc2626" } },
      { name: "震荡", type: "bar", stack: "total", data: trend.map((t) => t.neutral), itemStyle: { color: "#94a3b8" } },
    ],
  })
}

function renderConfChart() {
  if (!confChartRef.value || !stats.value) return
  if (!confChart) {
    confChart = echarts.init(confChartRef.value)
  }
  const conf = stats.value.confidenceTrend
  confChart.setOption({
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const p = params[0]
        return `${p.axisValue}<br/>平均置信度: ${(p.value * 100).toFixed(1)}%`
      },
    },
    grid: { top: 10, right: 16, bottom: 24, left: 44 },
    xAxis: {
      type: "category",
      data: conf.map((c) => c.date.slice(5)),
      axisLabel: { fontSize: 10 },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      axisLabel: { fontSize: 10, formatter: (v: number) => `${(v * 100).toFixed(0)}%` },
    },
    series: [
      {
        type: "line",
        data: conf.map((c) => c.avg),
        smooth: true,
        areaStyle: { color: "rgba(37,99,235,0.1)" },
        lineStyle: { color: "#2563eb", width: 2 },
        itemStyle: { color: "#2563eb" },
        symbol: "circle",
        symbolSize: 4,
      },
    ],
  })
}

function handleResize() {
  trendChart?.resize()
  confChart?.resize()
}

onMounted(() => {
  load()
  loadStats()
  if (!marketStore.series.length) {
    marketStore.fetchDashboard()
  }
  window.addEventListener("resize", handleResize)
})

onUnmounted(() => {
  window.removeEventListener("resize", handleResize)
  trendChart?.dispose()
  confChart?.dispose()
})

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("zh-CN")
}

type TagType = "success" | "danger" | "info"

function dirType(d: string): TagType {
  return d === "bullish" ? "success" : d === "bearish" ? "danger" : "info"
}

function dirLabel(d: string) {
  return d === "bullish" ? "看多" : d === "bearish" ? "看空" : "震荡"
}

function confidenceColor(c: number) {
  if (c >= 0.7) return "#16a34a"
  if (c >= 0.4) return "#f59e0b"
  return "#94a3b8"
}
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.page-title { font-size: 16px; font-weight: 600; color: #1e293b; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.section { margin-bottom: 24px; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}
.stat-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #edf2f7;
  padding: 18px 16px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  transition: box-shadow 0.2s;
}
.stat-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); }
.stat-number { font-size: 22px; font-weight: 700; color: #1e293b; }
.stat-label { font-size: 11px; color: #94a3b8; margin-top: 4px; }
.stat-pct { font-size: 11px; color: #64748b; margin-top: 2px; }
.stat-card.bullish .stat-number { color: #16a34a; }
.stat-card.bearish .stat-number { color: #dc2626; }
.stat-card.neutral .stat-number { color: #6b7280; }
.stat-card.confidence .stat-number { color: #2563eb; }
.stat-card.high-conf .stat-number { color: #7c3aed; }

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}
.chart-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #edf2f7;
  padding: 18px 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}
.chart-title { font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 12px; }
.chart-body { height: 200px; }

.table-card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #edf2f7;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}
.table-filters {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.expand-content { padding: 12px 16px; }
.expand-section { margin-bottom: 12px; }
.expand-label { font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px; }
.rationale-list { padding-left: 16px; font-size: 12px; color: #475569; line-height: 1.8; }
.rationale-list.risk li { color: #dc2626; }
.query-text { font-size: 12px; color: #475569; font-style: italic; }
.rationale-preview { font-size: 12px; color: #475569; }
.more { font-size: 11px; color: #94a3b8; }

@media (max-width: 1200px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .charts-row { grid-template-columns: 1fr; }
}
</style>
