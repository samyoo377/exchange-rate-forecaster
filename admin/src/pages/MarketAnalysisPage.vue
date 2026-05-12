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
                <el-tooltip :content="indicatorTooltips[sig.name] || sig.name" placement="top" :show-after="300">
                  <span class="sig-name has-tooltip">{{ sig.name }}</span>
                </el-tooltip>
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
            <div v-if="finbertData" class="finbert-section">
              <div class="finbert-header">
                <span class="finbert-label">FinBERT 模型分析</span>
                <el-tag :type="finbertSentimentType" size="small" effect="plain">{{ finbertData.summary.dominantCn }}</el-tag>
              </div>
              <div class="finbert-bar">
                <div class="bar-segment positive" :style="{ width: finbertPositivePct + '%' }"></div>
                <div class="bar-segment neutral" :style="{ width: finbertNeutralPct + '%' }"></div>
                <div class="bar-segment negative" :style="{ width: finbertNegativePct + '%' }"></div>
              </div>
              <div class="finbert-legend">
                <span class="legend-item positive">积极 {{ finbertData.summary.positive }}</span>
                <span class="legend-item neutral">中性 {{ finbertData.summary.neutral }}</span>
                <span class="legend-item negative">消极 {{ finbertData.summary.negative }}</span>
              </div>
            </div>
            <div v-else class="finbert-section">
              <div class="finbert-header">
                <span class="finbert-label">FinBERT 模型分析</span>
                <el-button size="small" :loading="finbertLoading" @click="loadFinBert">运行分析</el-button>
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

    <!-- ═══ Indicator Signal Tables ═══ -->
    <el-row :gutter="16" style="margin-top: 16px" v-if="dashData">
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover" class="signal-card">
          <div class="signal-header">震荡指标</div>
          <div class="signal-table">
            <div class="signal-table-header">
              <span class="col-name">名称</span>
              <span class="col-value">数值</span>
              <span class="col-signal">结论</span>
            </div>
            <div v-for="sig in oscillatorSignals" :key="sig.name" class="signal-row">
              <el-tooltip :content="indicatorTooltips[sig.name] || sig.name" placement="top" :show-after="300">
                <span class="sig-name has-tooltip">{{ sig.name }}</span>
              </el-tooltip>
              <span class="sig-value">{{ sig.value }}</span>
              <el-tag :type="sig.type" size="small" effect="plain">{{ sig.signal }}</el-tag>
            </div>
          </div>
          <div class="signal-summary-footer">
            <span>买入: {{ oscillatorSummary.buy }}</span>
            <span>卖出: {{ oscillatorSummary.sell }}</span>
            <span>中立: {{ oscillatorSummary.neutral }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover" class="signal-card">
          <div class="signal-header">移动平均线</div>
          <div class="signal-table">
            <div class="signal-table-header">
              <span class="col-name">名称</span>
              <span class="col-value">数值</span>
              <span class="col-signal">结论</span>
            </div>
            <div v-for="sig in maSignals" :key="sig.name" class="signal-row">
              <el-tooltip :content="indicatorTooltips[sig.name] || sig.name" placement="top" :show-after="300">
                <span class="sig-name has-tooltip">{{ sig.name }}</span>
              </el-tooltip>
              <span class="sig-value">{{ sig.value }}</span>
              <el-tag :type="sig.type" size="small" effect="plain">{{ sig.signal }}</el-tag>
            </div>
          </div>
          <div class="signal-summary-footer">
            <span>买入: {{ maSummary.buy }}</span>
            <span>卖出: {{ maSummary.sell }}</span>
            <span>中立: {{ maSummary.neutral }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card shadow="hover" class="signal-card">
          <div class="signal-header">轴枢点</div>
          <div class="signal-table">
            <div class="signal-table-header">
              <span class="col-name">名称</span>
              <span class="col-value">数值</span>
              <span class="col-signal">结论</span>
            </div>
            <div v-for="sig in pivotSignals" :key="sig.name" class="signal-row">
              <el-tooltip :content="indicatorTooltips[sig.name] || sig.name" placement="top" :show-after="300">
                <span class="sig-name has-tooltip">{{ sig.name }}</span>
              </el-tooltip>
              <span class="sig-value">{{ sig.value }}</span>
              <el-tag :type="sig.type" size="small" effect="plain">{{ sig.signal }}</el-tag>
            </div>
          </div>
          <div class="signal-summary-footer">
            <span>买入: {{ pivotSummary.buy }}</span>
            <span>卖出: {{ pivotSummary.sell }}</span>
            <span>中立: {{ pivotSummary.neutral }}</span>
          </div>
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
import { ElMessage } from "element-plus"
import {
  getRateTrend, getPredictionsTimeline, getDashboardData, getLatestDigest,
  runFinBertAnalysis, getFinBertStatus,
  type RateTrendData, type DashboardData, type NewsDigestDetail, type FinBertAnalysis,
} from "../api/index"

type TagType = "success" | "danger" | "warning" | "info"

const indicatorTooltips: Record<string, string> = {
  "RSI(14)": "相对强弱指数，衡量价格变动速度和幅度。>70超买，<30超卖",
  "Stoch %K": "随机振荡器快线，衡量收盘价相对于高低价区间的位置",
  "Stoch %D": "随机振荡器慢线，%K的3日移动平均",
  "CCI(20)": "商品通道指数，衡量价格偏离统计均值的程度。>100超买，<-100超卖",
  "ADX(14)": "平均方向指数，衡量趋势强度（不分方向）。>25强趋势，<20弱趋势",
  "AO": "动量震荡指标(Awesome Oscillator)，5期与34期中值均线之差",
  "MOM(10)": "动量指标，当前价格与10期前价格之差",
  "MACD": "移动平均收敛/发散指标，12期EMA与26期EMA之差",
  "StochRSI %K": "随机RSI快线，将RSI值进行随机振荡器处理",
  "Williams %R": "威廉指标，衡量收盘价在最近N日高低价区间中的位置",
  "Bull/Bear Power": "多空力量指标，衡量买方/卖方力量强弱",
  "UO": "终极振荡器(Ultimate Oscillator)，综合短中长三个周期的动量",
  "EMA(10)": "10期指数移动平均线，对近期价格赋予更高权重",
  "EMA(20)": "20期指数移动平均线",
  "EMA(30)": "30期指数移动平均线",
  "EMA(50)": "50期指数移动平均线，中期趋势参考",
  "EMA(100)": "100期指数移动平均线",
  "EMA(200)": "200期指数移动平均线，长期趋势分水岭",
  "SMA(10)": "10期简单移动平均线",
  "SMA(20)": "20期简单移动平均线",
  "SMA(30)": "30期简单移动平均线",
  "SMA(50)": "50期简单移动平均线",
  "SMA(100)": "100期简单移动平均线",
  "SMA(200)": "200期简单移动平均线，长期趋势参考",
  "VWMA": "成交量加权移动平均线，成交量大的价格权重更高",
  "HMA": "Hull移动平均线，减少滞后性的改良均线",
  "Ichimoku 转换线": "一目均衡表转换线(Tenkan-sen)，9期高低价中值",
  "Ichimoku 基准线": "一目均衡表基准线(Kijun-sen)，26期高低价中值",
  "Ichimoku 先行A": "一目均衡表先行带A(Senkou Span A)，转换线与基准线均值",
  "Ichimoku 先行B": "一目均衡表先行带B(Senkou Span B)，52期高低价中值",
  "R3": "第三阻力位，强阻力区域，价格突破此位表示极强上涨动能",
  "R2": "第二阻力位，较强阻力区域",
  "R1": "第一阻力位，初始阻力区域",
  "P (枢轴点)": "枢轴点/中心点，由前一周期高低收计算的核心参考价位",
  "S1": "第一支撑位，初始支撑区域",
  "S2": "第二支撑位，较强支撑区域",
  "S3": "第三支撑位，强支撑区域，价格跌破此位表示极强下跌动能",
}

const trendChartRef = ref<HTMLElement>()
const predictionChartRef = ref<HTMLElement>()
const loading = ref(false)
const trendPeriod = ref("30")

const trendData = ref<RateTrendData | null>(null)
const predictions = ref<any[]>([])
const dashData = ref<DashboardData | null>(null)
const latestDigest = ref<NewsDigestDetail | null>(null)
const finbertData = ref<FinBertAnalysis | null>(null)
const finbertLoading = ref(false)

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

function sigMa(maValue?: number, close?: number) {
  if (maValue == null || close == null) return { signal: "—", type: "info" as TagType }
  return close > maValue ? { signal: "买入", type: "success" as TagType } : { signal: "卖出", type: "danger" as TagType }
}

function sigPivot(pivotValue?: number, close?: number) {
  if (pivotValue == null || close == null) return { signal: "—", type: "info" as TagType }
  const diff = ((close - pivotValue) / pivotValue) * 10000
  return diff > 100 ? { signal: "卖出", type: "danger" as TagType } : diff < -100 ? { signal: "买入", type: "success" as TagType } : { signal: "中立", type: "info" as TagType }
}

const oscillatorSignals = computed(() => {
  if (!dashData.value) return []
  const ind = dashData.value.indicators
  const fmt = (v?: number, d = 2) => v == null ? "—" : v.toFixed(d)
  return [
    { name: "RSI(14)", value: fmt(ind.rsi14), ...sigRsi(ind.rsi14) },
    { name: "Stoch %K", value: fmt(ind.stochK), ...sigStoch(ind.stochK) },
    { name: "CCI(20)", value: fmt(ind.cci20), ...sigCci(ind.cci20) },
    { name: "ADX(14)", value: fmt(ind.adx14), ...sigAo(ind.adx14) },
    { name: "AO", value: fmt(ind.ao, 5), ...sigAo(ind.ao) },
    { name: "MOM(10)", value: fmt(ind.mom10, 4), ...sigMom(ind.mom10) },
    { name: "MACD", value: fmt(ind.macd, 5), ...sigAo(ind.macd) },
    { name: "Stoch RSI", value: fmt(ind.stochRsiK), ...sigStoch(ind.stochRsiK) },
    { name: "Williams %R", value: fmt(ind.williamsR), ...(ind.williamsR == null ? { signal: "—", type: "info" as TagType } : ind.williamsR < -80 ? { signal: "买入", type: "success" as TagType } : ind.williamsR > -20 ? { signal: "卖出", type: "danger" as TagType } : { signal: "中立", type: "info" as TagType }) },
    { name: "Bull Bear Power", value: fmt(ind.bullPower, 4), ...sigAo(ind.bullPower) },
    { name: "UO", value: fmt(ind.uo), ...(ind.uo == null ? { signal: "—", type: "info" as TagType } : ind.uo > 70 ? { signal: "买入", type: "success" as TagType } : ind.uo < 30 ? { signal: "卖出", type: "danger" as TagType } : { signal: "中立", type: "info" as TagType }) },
  ]
})

const oscillatorSummary = computed(() => {
  const sigs = oscillatorSignals.value
  return {
    buy: sigs.filter((s) => s.type === "success").length,
    sell: sigs.filter((s) => s.type === "danger").length,
    neutral: sigs.filter((s) => s.type === "info").length,
  }
})

const maSignals = computed(() => {
  if (!dashData.value) return []
  const ind = dashData.value.indicators
  const close = currentRate.value ?? undefined
  const fmt = (v?: number) => v == null ? "—" : v.toFixed(4)
  return [
    { name: "EMA(10)", value: fmt(ind.ema10), ...sigMa(ind.ema10, close) },
    { name: "EMA(20)", value: fmt(ind.ema20), ...sigMa(ind.ema20, close) },
    { name: "EMA(30)", value: fmt(ind.ema30), ...sigMa(ind.ema30, close) },
    { name: "EMA(50)", value: fmt(ind.ema50), ...sigMa(ind.ema50, close) },
    { name: "EMA(100)", value: fmt(ind.ema100), ...sigMa(ind.ema100, close) },
    { name: "EMA(200)", value: fmt(ind.ema200), ...sigMa(ind.ema200, close) },
    { name: "SMA(10)", value: fmt(ind.sma10), ...sigMa(ind.sma10, close) },
    { name: "SMA(20)", value: fmt(ind.sma20), ...sigMa(ind.sma20, close) },
    { name: "SMA(30)", value: fmt(ind.sma30), ...sigMa(ind.sma30, close) },
    { name: "SMA(50)", value: fmt(ind.sma50), ...sigMa(ind.sma50, close) },
    { name: "SMA(100)", value: fmt(ind.sma100), ...sigMa(ind.sma100, close) },
    { name: "SMA(200)", value: fmt(ind.sma200), ...sigMa(ind.sma200, close) },
    { name: "VWMA(20)", value: fmt(ind.vwma), ...sigMa(ind.vwma, close) },
    { name: "HMA(9)", value: fmt(ind.hma), ...sigMa(ind.hma, close) },
    { name: "Ichimoku", value: fmt(ind.ichTenkan), ...sigMa(ind.ichTenkan, close) },
  ]
})

const maSummary = computed(() => {
  const sigs = maSignals.value
  return {
    buy: sigs.filter((s) => s.type === "success").length,
    sell: sigs.filter((s) => s.type === "danger").length,
    neutral: sigs.filter((s) => s.type === "info").length,
  }
})

const pivotSignals = computed(() => {
  if (!dashData.value) return []
  const ind = dashData.value.indicators
  const close = currentRate.value ?? undefined
  const fmt = (v?: number) => v == null ? "—" : v.toFixed(4)
  return [
    { name: "R3", value: fmt(ind.pivotR3), ...sigPivot(ind.pivotR3, close) },
    { name: "R2", value: fmt(ind.pivotR2), ...sigPivot(ind.pivotR2, close) },
    { name: "R1", value: fmt(ind.pivotR1), ...sigPivot(ind.pivotR1, close) },
    { name: "P", value: fmt(ind.pivotPP), ...sigPivot(ind.pivotPP, close) },
    { name: "S1", value: fmt(ind.pivotS1), ...sigPivot(ind.pivotS1, close) },
    { name: "S2", value: fmt(ind.pivotS2), ...sigPivot(ind.pivotS2, close) },
    { name: "S3", value: fmt(ind.pivotS3), ...sigPivot(ind.pivotS3, close) },
  ]
})

const pivotSummary = computed(() => {
  const sigs = pivotSignals.value
  return {
    buy: sigs.filter((s) => s.type === "success").length,
    sell: sigs.filter((s) => s.type === "danger").length,
    neutral: sigs.filter((s) => s.type === "info").length,
  }
})

function directionEmoji(d: string) { return d === "bullish" ? "📈" : d === "bearish" ? "📉" : "➡" }
function directionText(d: string) { return d === "bullish" ? "看多" : d === "bearish" ? "看空" : "震荡" }
function confColor(c: number) { return c >= 0.7 ? "#67c23a" : c >= 0.4 ? "#e6a23c" : "#909399" }
function sentimentType(s: string) { return s === "bullish" ? "warning" : s === "bearish" ? "success" : "info" }
function sentimentLabel(s: string) { return s === "bullish" ? "看涨美元" : s === "bearish" ? "看跌美元" : "中性" }

const finbertSentimentType = computed(() => {
  if (!finbertData.value) return "info"
  const d = finbertData.value.summary.dominant
  return d === "positive" ? "success" : d === "negative" ? "danger" : "info"
})
const finbertPositivePct = computed(() => {
  if (!finbertData.value) return 0
  return Math.round((finbertData.value.summary.positive / finbertData.value.summary.total) * 100)
})
const finbertNeutralPct = computed(() => {
  if (!finbertData.value) return 0
  return Math.round((finbertData.value.summary.neutral / finbertData.value.summary.total) * 100)
})
const finbertNegativePct = computed(() => {
  if (!finbertData.value) return 0
  return Math.round((finbertData.value.summary.negative / finbertData.value.summary.total) * 100)
})

async function loadFinBert() {
  finbertLoading.value = true
  try {
    finbertData.value = await runFinBertAnalysis()
  } catch (e) {
    ElMessage.warning("FinBERT 服务未启动或分析失败")
  } finally {
    finbertLoading.value = false
  }
}

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
    getFinBertStatus().then((s) => { if (s.available) loadFinBert() }).catch(() => {})
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

  const pivotLines: any[] = []
  if (dashData.value?.indicators) {
    const ind = dashData.value.indicators
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
        pivotLines.push({
          yAxis: lv.value,
          label: { formatter: `${lv.label} ${lv.value.toFixed(4)}`, position: "insideEndTop", fontSize: 10, color: lv.color },
          lineStyle: { color: lv.color, type: "dashed", width: 1 },
        })
      }
    }
  }

  trendChart.setOption({
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const p = params[0]
        return `${p.axisValue}<br/>汇率: <strong>${p.value.toFixed(4)}</strong>`
      },
    },
    grid: { left: 60, right: 60, top: 30, bottom: 50 },
    xAxis: { type: "category", data: dates, axisLabel: { fontSize: 10, rotate: 30, interval: Math.max(0, Math.floor(dates.length / 12) - 1) } },
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
        markLine: pivotLines.length > 0 ? {
          silent: true,
          symbol: "none",
          data: pivotLines,
        } : undefined,
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
  const dates = preds.map((p) => p.createdAt?.slice(0, 16).replace("T", " ") ?? "")
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
    grid: { left: 60, right: 60, top: 40, bottom: 50 },
    xAxis: { type: "category", data: dates, axisLabel: { fontSize: 10, rotate: 30 } },
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
.sig-name.has-tooltip { cursor: help; border-bottom: 1px dashed #c0c4cc; }
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

.finbert-section { margin-top: 12px; padding-top: 10px; border-top: 1px solid #ebeef5; }
.finbert-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.finbert-label { font-size: 12px; font-weight: 600; color: #303133; }
.finbert-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: #f0f2f5; }
.finbert-bar .bar-segment { transition: width 0.3s; }
.finbert-bar .bar-segment.positive { background: #67c23a; }
.finbert-bar .bar-segment.neutral { background: #909399; }
.finbert-bar .bar-segment.negative { background: #f56c6c; }
.finbert-legend { display: flex; gap: 12px; margin-top: 4px; font-size: 11px; }
.finbert-legend .legend-item { display: flex; align-items: center; gap: 4px; }
.finbert-legend .legend-item.positive { color: #67c23a; }
.finbert-legend .legend-item.neutral { color: #909399; }
.finbert-legend .legend-item.negative { color: #f56c6c; }

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

.signal-table { display: flex; flex-direction: column; gap: 2px; }
.signal-table-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #909399;
  padding: 4px 8px;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 4px;
}
.col-name { flex: 1; }
.col-value { min-width: 70px; text-align: right; }
.col-signal { min-width: 50px; text-align: center; }

.signal-summary-footer {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #ebeef5;
  font-size: 12px;
  color: #606266;
}
</style>
