<template>
  <div class="market-analysis">
    <div class="page-header">
      <h2 class="page-title">行情分析</h2>
      <div class="header-meta">
        <span v-if="currentRate" class="current-rate">
          USD/CNH <strong>{{ currentRate.toFixed(4) }}</strong>
        </span>
        <el-tag v-if="rateChange !== null" :type="rateChange >= 0 ? 'danger' : 'success'" size="small">
          {{ rateChange >= 0 ? '+' : '' }}{{ rateChange.toFixed(4) }} ({{ rateChangePercent }})
        </el-tag>
        <el-button size="small" :icon="Refresh" circle @click="loadData" :loading="loading" />
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="24">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="chart-header">
              <span class="chart-title">USD/CNH 汇率趋势图（30天）</span>
              <el-radio-group v-model="trendPeriod" size="small" @change="loadData">
                <el-radio-button value="7">7天</el-radio-button>
                <el-radio-button value="30">30天</el-radio-button>
                <el-radio-button value="60">60天</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div ref="trendChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="24">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="chart-header">
              <span class="chart-title">汇率量化预测图（30天预测历史）</span>
              <el-tag size="small" type="info">基于7策略复合评分</el-tag>
            </div>
          </template>
          <div ref="predictionChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover" class="signal-card">
          <div class="signal-header">技术面信号</div>
          <template v-if="dashData">
            <div class="signal-summary">
              <el-tag :type="techSentiment.type" effect="dark">{{ techSentiment.label }}</el-tag>
            </div>
            <div class="signal-list">
              <div v-for="sig in techSignals" :key="sig.name" class="signal-row">
                <span class="sig-name">{{ sig.name }}</span>
                <span class="sig-value">{{ sig.value }}</span>
                <el-tag :type="sig.type" size="small" effect="plain">{{ sig.signal }}</el-tag>
              </div>
            </div>
          </template>
          <el-empty v-else :image-size="40" description="暂无数据" />
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover" class="signal-card">
          <div class="signal-header">消息面研判</div>
          <template v-if="latestDigest">
            <div class="signal-summary">
              <el-tag :type="sentimentType(latestDigest.sentiment)" effect="dark">
                {{ sentimentLabel(latestDigest.sentiment) }}
              </el-tag>
            </div>
            <div class="news-brief">{{ latestDigest.headline }}</div>
            <div v-if="latestDigest.keyFactors?.length" class="factor-list">
              <div v-for="(f, i) in latestDigest.keyFactors.slice(0, 4)" :key="i" class="factor-row">
                <span :class="['factor-dot', f.direction]"></span>
                <span class="factor-name">{{ f.factor }}</span>
                <span v-if="f.score != null" class="factor-score">{{ f.score > 0 ? '+' : '' }}{{ f.score.toFixed(2) }}</span>
              </div>
            </div>
          </template>
          <el-empty v-else :image-size="40" description="暂无摘要" />
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover" class="signal-card">
          <div class="signal-header">综合预测</div>
          <template v-if="dashData?.latestPrediction">
            <div class="pred-big">
              <span :class="['direction-icon', dashData.latestPrediction.direction]">
                {{ directionEmoji(dashData.latestPrediction.direction) }}
              </span>
              <span :class="['direction-text', dashData.latestPrediction.direction]">
                {{ directionText(dashData.latestPrediction.direction) }}
              </span>
            </div>
            <el-progress
              :percentage="Math.round(dashData.latestPrediction.confidence * 100)"
              :stroke-width="8"
              :color="confColor(dashData.latestPrediction.confidence)"
              style="margin-top: 12px"
            />
            <div class="pred-meta">
              <el-tag size="small" type="info">{{ dashData.latestPrediction.horizon }}</el-tag>
              <span class="conf-text">置信度 {{ Math.round(dashData.latestPrediction.confidence * 100) }}%</span>
            </div>
          </template>
          <el-empty v-else :image-size="40" description="暂无预测" />
        </el-card>
      </el-col>
    </el-row>

    <div class="disclaimer">
      以上分析仅供参考，不构成投资建议。市场有风险，决策需谨慎。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue"
import { Refresh } from "@element-plus/icons-vue"
import * as echarts from "echarts"
import {
  getRateTrend, getPredictionsTimeline, getDashboardData, getLatestDigest,
  type RateTrendData, type DashboardData, type NewsDigestDetail,
} from "../api/index"

type TagType = "success" | "danger" | "warning" | "info"

const trendChartRef = ref<HTMLElement>()
const predictionChartRef = ref<HTMLElement>()
const loading = ref(false)
const trendPeriod = ref("30")

const trendData = ref<RateTrendData | null>(null)
const predictions = ref<any[]>([])
const dashData = ref<DashboardData | null>(null)
const latestDigest = ref<NewsDigestDetail | null>(null)

let trendChart: echarts.ECharts | null = null
let predChart: echarts.ECharts | null = null

const currentRate = computed(() => trendData.value?.currentRate ?? null)
const rateChange = computed(() => {
  if (!trendData.value?.data?.length) return null
  const data = trendData.value.data
  if (data.length < 2) return null
  return data[data.length - 1].rate - data[data.length - 2].rate
})
const rateChangePercent = computed(() => {
  if (!trendData.value?.data?.length || rateChange.value === null) return ""
  const data = trendData.value.data
  const prev = data[data.length - 2].rate
  return ((rateChange.value / prev) * 100).toFixed(3) + "%"
})

const techSignals = computed(() => {
  if (!dashData.value) return []
  const ind = dashData.value.indicators
  const fmt = (v?: number, d = 2) => v == null ? "—" : v.toFixed(d)
  return [
    { name: "RSI(14)", value: fmt(ind.rsi14), ...sigRsi(ind.rsi14) },
    { name: "Stoch %K", value: fmt(ind.stochK), ...sigStoch(ind.stochK) },
    { name: "CCI(20)", value: fmt(ind.cci20), ...sigCci(ind.cci20) },
    { name: "AO", value: fmt(ind.ao, 5), ...sigAo(ind.ao) },
    { name: "MOM(10)", value: fmt(ind.mom10, 4), ...sigMom(ind.mom10) },
  ]
})

const techSentiment = computed(() => {
  const sigs = techSignals.value
  const bull = sigs.filter((s) => s.type === "success").length
  const bear = sigs.filter((s) => s.type === "danger").length
  if (bull > bear + 1) return { label: "偏多", type: "success" as TagType }
  if (bear > bull + 1) return { label: "偏空", type: "danger" as TagType }
  return { label: "中性", type: "info" as TagType }
})

function sigRsi(v?: number) { return v == null ? { signal: "—", type: "info" as TagType } : v < 30 ? { signal: "超卖", type: "success" as TagType } : v > 70 ? { signal: "超买", type: "danger" as TagType } : { signal: "中性", type: "info" as TagType } }
function sigStoch(v?: number) { return v == null ? { signal: "—", type: "info" as TagType } : v < 20 ? { signal: "超卖", type: "success" as TagType } : v > 80 ? { signal: "超买", type: "danger" as TagType } : { signal: "中性", type: "info" as TagType } }
function sigCci(v?: number) { return v == null ? { signal: "—", type: "info" as TagType } : v < -100 ? { signal: "超卖", type: "success" as TagType } : v > 100 ? { signal: "超买", type: "danger" as TagType } : { signal: "中性", type: "info" as TagType } }
function sigAo(v?: number) { return v == null ? { signal: "—", type: "info" as TagType } : v > 0 ? { signal: "偏多", type: "success" as TagType } : v < 0 ? { signal: "偏空", type: "danger" as TagType } : { signal: "中性", type: "info" as TagType } }
function sigMom(v?: number) { return v == null ? { signal: "—", type: "info" as TagType } : v > 0 ? { signal: "偏多", type: "success" as TagType } : v < 0 ? { signal: "偏空", type: "danger" as TagType } : { signal: "中性", type: "info" as TagType } }

function directionEmoji(d: string) { return d === "bullish" ? "📈" : d === "bearish" ? "📉" : "➡" }
function directionText(d: string) { return d === "bullish" ? "看多" : d === "bearish" ? "看空" : "震荡" }
function confColor(c: number) { return c >= 0.7 ? "#67c23a" : c >= 0.4 ? "#e6a23c" : "#909399" }
function sentimentType(s: string) { return s === "bullish" ? "warning" : s === "bearish" ? "success" : "info" }
function sentimentLabel(s: string) { return s === "bullish" ? "看涨美元" : s === "bearish" ? "看跌美元" : "中性" }

async function loadData() {
  loading.value = true
  try {
    const [trend, preds, dash, digest] = await Promise.all([
      getRateTrend(parseInt(trendPeriod.value)),
      getPredictionsTimeline("USDCNH", 30),
      getDashboardData(),
      getLatestDigest(),
    ])
    trendData.value = trend
    predictions.value = preds ?? []
    if (dash) dashData.value = dash
    if (digest) latestDigest.value = digest
    await nextTick()
    renderTrendChart()
    renderPredictionChart()
  } catch (e) {
    console.error("Failed to load market data:", e)
  } finally {
    loading.value = false
  }
}

function renderTrendChart() {
  if (!trendChartRef.value || !trendData.value?.data?.length) return
  if (!trendChart) {
    trendChart = echarts.init(trendChartRef.value)
  }
  const data = trendData.value.data
  const dates = data.map((d) => d.date)
  const rates = data.map((d) => d.rate)
  const ma5 = computeMA(rates, 5)
  const ma10 = computeMA(rates, 10)

  trendChart.setOption({
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const p = params[0]
        return `${p.axisValue}<br/>汇率: <strong>${p.value.toFixed(4)}</strong>`
      },
    },
    grid: { left: 60, right: 20, top: 30, bottom: 40 },
    xAxis: { type: "category", data: dates, axisLabel: { fontSize: 11 } },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: (v: number) => v.toFixed(3) },
      splitLine: { lineStyle: { type: "dashed", color: "#eee" } },
    },
    series: [
      {
        name: "USD/CNH",
        type: "line",
        data: rates,
        smooth: true,
        lineStyle: { width: 2, color: "#409eff" },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: "rgba(64,158,255,0.15)" },
          { offset: 1, color: "rgba(64,158,255,0.01)" },
        ]) },
        symbol: "none",
      },
      {
        name: "MA5",
        type: "line",
        data: ma5,
        smooth: true,
        lineStyle: { width: 1, color: "#e6a23c", type: "dashed" },
        symbol: "none",
      },
      {
        name: "MA10",
        type: "line",
        data: ma10,
        smooth: true,
        lineStyle: { width: 1, color: "#67c23a", type: "dashed" },
        symbol: "none",
      },
    ],
  })
}

function renderPredictionChart() {
  if (!predictionChartRef.value || !predictions.value.length) return
  if (!predChart) {
    predChart = echarts.init(predictionChartRef.value)
  }
  const preds = [...predictions.value].reverse()
  const dates = preds.map((p) => p.createdAt?.slice(0, 10) ?? "")
  const confidences = preds.map((p) => p.confidence * 100)
  const directions = preds.map((p) =>
    p.direction === "bullish" ? 1 : p.direction === "bearish" ? -1 : 0
  )

  predChart.setOption({
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const conf = params[0]
        const dir = params[1]
        const dirLabel = dir.value > 0 ? "看多" : dir.value < 0 ? "看空" : "震荡"
        return `${conf.axisValue}<br/>置信度: ${conf.value.toFixed(0)}%<br/>方向: ${dirLabel}`
      },
    },
    legend: { data: ["置信度", "方向信号"], top: 0 },
    grid: { left: 60, right: 60, top: 40, bottom: 40 },
    xAxis: { type: "category", data: dates, axisLabel: { fontSize: 11 } },
    yAxis: [
      {
        type: "value",
        name: "置信度%",
        min: 0,
        max: 100,
        splitLine: { lineStyle: { type: "dashed", color: "#eee" } },
      },
      {
        type: "value",
        name: "方向",
        min: -1.5,
        max: 1.5,
        axisLabel: { formatter: (v: number) => v > 0 ? "多" : v < 0 ? "空" : "平" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "置信度",
        type: "bar",
        data: confidences,
        yAxisIndex: 0,
        itemStyle: {
          color: (params: any) => {
            const dir = directions[params.dataIndex]
            return dir > 0 ? "#67c23a" : dir < 0 ? "#f56c6c" : "#909399"
          },
          borderRadius: [3, 3, 0, 0],
        },
        barMaxWidth: 20,
      },
      {
        name: "方向信号",
        type: "line",
        data: directions,
        yAxisIndex: 1,
        lineStyle: { width: 2, color: "#e6a23c" },
        symbol: "circle",
        symbolSize: 6,
      },
    ],
  })
}

function computeMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null
    const slice = data.slice(i - period + 1, i + 1)
    return slice.reduce((s, v) => s + v, 0) / period
  })
}

function handleResize() {
  trendChart?.resize()
  predChart?.resize()
}

onMounted(() => {
  loadData()
  window.addEventListener("resize", handleResize)
})

onUnmounted(() => {
  window.removeEventListener("resize", handleResize)
  trendChart?.dispose()
  predChart?.dispose()
})
</script>

<style scoped>
.market-analysis { max-width: 1400px; }

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-title { font-size: 20px; font-weight: 700; color: #303133; }

.header-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.current-rate {
  font-size: 14px;
  color: #606266;
}

.current-rate strong {
  font-size: 18px;
  color: #303133;
}

.chart-card { border-radius: 10px; }

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chart-title { font-size: 14px; font-weight: 600; color: #303133; }

.chart-container { height: 320px; width: 100%; }

.signal-card {
  border-radius: 10px;
  height: 100%;
}

.signal-header {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.signal-summary { margin-bottom: 10px; }

.signal-list { display: flex; flex-direction: column; gap: 4px; }

.signal-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 8px;
  background: #fafbfc;
  border-radius: 4px;
}

.sig-name { color: #606266; min-width: 60px; }
.sig-value { font-weight: 600; color: #303133; min-width: 50px; text-align: right; }

.news-brief {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
  margin-bottom: 10px;
  line-height: 1.5;
}

.factor-list { display: flex; flex-direction: column; gap: 4px; }

.factor-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.factor-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.factor-dot.bullish { background: #e6a23c; }
.factor-dot.bearish { background: #67c23a; }
.factor-dot.neutral { background: #909399; }

.factor-name { color: #606266; flex: 1; }
.factor-score { font-weight: 600; font-size: 11px; color: #303133; }

.pred-big {
  display: flex;
  align-items: center;
  gap: 8px;
}

.direction-icon { font-size: 28px; }
.direction-text { font-size: 20px; font-weight: 700; }
.direction-text.bullish { color: #67c23a; }
.direction-text.bearish { color: #f56c6c; }
.direction-text.neutral { color: #909399; }

.pred-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.conf-text { font-size: 12px; color: #909399; }

.disclaimer {
  margin-top: 20px;
  font-size: 12px;
  color: #e6a23c;
  background: #fef9f0;
  border: 1px solid #faecd8;
  border-radius: 6px;
  padding: 8px 14px;
}
</style>
