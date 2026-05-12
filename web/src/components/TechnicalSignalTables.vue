<template>
  <div class="signal-tables">
    <div class="signal-group">
      <div class="group-header">
        <h4 class="group-title">震荡指标</h4>
        <div class="group-summary">
          <span class="sum-buy">买入 {{ oscillatorSummary.buy }}</span>
          <span class="sum-sell">卖出 {{ oscillatorSummary.sell }}</span>
          <span class="sum-neutral">中立 {{ oscillatorSummary.neutral }}</span>
        </div>
      </div>
      <div class="signal-grid">
        <el-tooltip v-for="sig in oscillatorSignals" :key="sig.name" :content="tooltips[sig.name] || sig.name" placement="top" :show-after="300">
          <div class="signal-row">
            <span class="sig-name">{{ sig.name }}</span>
            <span class="sig-value">{{ sig.value }}</span>
            <el-tag :type="sig.type" size="small" effect="plain">{{ sig.signal }}</el-tag>
          </div>
        </el-tooltip>
      </div>
    </div>

    <div class="signal-group">
      <div class="group-header">
        <h4 class="group-title">移动平均线</h4>
        <div class="group-summary">
          <span class="sum-buy">买入 {{ maSummary.buy }}</span>
          <span class="sum-sell">卖出 {{ maSummary.sell }}</span>
          <span class="sum-neutral">中立 {{ maSummary.neutral }}</span>
        </div>
      </div>
      <div class="signal-grid">
        <el-tooltip v-for="sig in maSignals" :key="sig.name" :content="tooltips[sig.name] || sig.name" placement="top" :show-after="300">
          <div class="signal-row">
            <span class="sig-name">{{ sig.name }}</span>
            <span class="sig-value">{{ sig.value }}</span>
            <el-tag :type="sig.type" size="small" effect="plain">{{ sig.signal }}</el-tag>
          </div>
        </el-tooltip>
      </div>
    </div>

    <div class="signal-group">
      <div class="group-header">
        <h4 class="group-title">轴枢点</h4>
        <div class="group-summary">
          <span class="sum-buy">买入 {{ pivotSummary.buy }}</span>
          <span class="sum-sell">卖出 {{ pivotSummary.sell }}</span>
          <span class="sum-neutral">中立 {{ pivotSummary.neutral }}</span>
        </div>
      </div>
      <div class="signal-grid">
        <el-tooltip v-for="sig in pivotSignals" :key="sig.name" :content="tooltips[sig.name] || sig.name" placement="top" :show-after="300">
          <div class="signal-row">
            <span class="sig-name">{{ sig.name }}</span>
            <span class="sig-value">{{ sig.value }}</span>
            <el-tag :type="sig.type" size="small" effect="plain">{{ sig.signal }}</el-tag>
          </div>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { IndicatorValues } from "../types/index"

type TagType = "success" | "danger" | "warning" | "info"

const props = defineProps<{ indicators: IndicatorValues }>()

const tooltips: Record<string, string> = {
  "RSI(14)": "相对强弱指数，衡量价格变动速度和幅度。>70超买，<30超卖",
  "Stoch %K": "随机振荡器快线，衡量收盘价相对于高低价区间的位置",
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

function fmt(v: number | undefined, dec = 4): string {
  return v == null ? "—" : v.toFixed(dec)
}

function sigOsc(value: number | undefined, buyBelow: number, sellAbove: number): { signal: string; type: TagType } {
  if (value == null) return { signal: "—", type: "info" }
  if (value < buyBelow) return { signal: "买入", type: "success" }
  if (value > sellAbove) return { signal: "卖出", type: "danger" }
  return { signal: "中立", type: "info" }
}

function sigMa(maValue: number | undefined): { signal: string; type: TagType } {
  const close = props.indicators.close
  if (maValue == null || close == null) return { signal: "—", type: "info" }
  if (close > maValue) return { signal: "买入", type: "success" }
  if (close < maValue) return { signal: "卖出", type: "danger" }
  return { signal: "中立", type: "info" }
}

function sigPivot(level: number | undefined): { signal: string; type: TagType } {
  const close = props.indicators.close
  if (level == null || close == null) return { signal: "—", type: "info" }
  const diffBps = ((close - level) / level) * 10000
  if (diffBps > 100) return { signal: "卖出", type: "danger" }
  if (diffBps < -100) return { signal: "买入", type: "success" }
  return { signal: "中立", type: "info" }
}

const oscillatorSignals = computed(() => {
  const ind = props.indicators
  const items = [
    { name: "RSI(14)", value: fmt(ind.rsi14, 2), ...sigOsc(ind.rsi14, 30, 70) },
    { name: "Stoch %K", value: fmt(ind.stochK, 2), ...sigOsc(ind.stochK, 20, 80) },
    { name: "CCI(20)", value: fmt(ind.cci20, 2), ...sigOsc(ind.cci20, -100, 100) },
    { name: "ADX(14)", value: fmt(ind.adx14, 2), signal: ind.adx14 != null && ind.adx14 > 25 ? "强趋势" : "弱趋势", type: (ind.adx14 != null && ind.adx14 > 25 ? "warning" : "info") as TagType },
    { name: "AO", value: fmt(ind.ao, 5), signal: ind.ao == null ? "—" : ind.ao > 0 ? "买入" : "卖出", type: (ind.ao == null ? "info" : ind.ao > 0 ? "success" : "danger") as TagType },
    { name: "MOM(10)", value: fmt(ind.mom10, 4), signal: ind.mom10 == null ? "—" : ind.mom10 > 0 ? "买入" : "卖出", type: (ind.mom10 == null ? "info" : ind.mom10 > 0 ? "success" : "danger") as TagType },
    { name: "MACD", value: fmt(ind.macd, 5), signal: ind.macd == null ? "—" : ind.macd > 0 ? "买入" : "卖出", type: (ind.macd == null ? "info" : ind.macd > 0 ? "success" : "danger") as TagType },
    { name: "StochRSI %K", value: fmt(ind.stochRsiK, 2), ...sigOsc(ind.stochRsiK, 20, 80) },
    { name: "Williams %R", value: fmt(ind.williamsR, 2), ...sigOsc(ind.williamsR, -80, -20) },
    { name: "Bull/Bear Power", value: fmt(ind.bullPower, 5), signal: ind.bullPower == null ? "—" : ind.bullPower > 0 ? "买入" : "卖出", type: (ind.bullPower == null ? "info" : ind.bullPower > 0 ? "success" : "danger") as TagType },
    { name: "UO", value: fmt(ind.uo, 2), ...sigOsc(ind.uo, 30, 70) },
  ]
  return items
})

const maSignals = computed(() => {
  const ind = props.indicators
  return [
    { name: "EMA(10)", value: fmt(ind.ema10), ...sigMa(ind.ema10) },
    { name: "EMA(20)", value: fmt(ind.ema20), ...sigMa(ind.ema20) },
    { name: "EMA(30)", value: fmt(ind.ema30), ...sigMa(ind.ema30) },
    { name: "EMA(50)", value: fmt(ind.ema50), ...sigMa(ind.ema50) },
    { name: "EMA(100)", value: fmt(ind.ema100), ...sigMa(ind.ema100) },
    { name: "EMA(200)", value: fmt(ind.ema200), ...sigMa(ind.ema200) },
    { name: "SMA(10)", value: fmt(ind.sma10), ...sigMa(ind.sma10) },
    { name: "SMA(20)", value: fmt(ind.sma20), ...sigMa(ind.sma20) },
    { name: "SMA(30)", value: fmt(ind.sma30), ...sigMa(ind.sma30) },
    { name: "SMA(50)", value: fmt(ind.sma50), ...sigMa(ind.sma50) },
    { name: "SMA(100)", value: fmt(ind.sma100), ...sigMa(ind.sma100) },
    { name: "SMA(200)", value: fmt(ind.sma200), ...sigMa(ind.sma200) },
    { name: "VWMA", value: fmt(ind.vwma), ...sigMa(ind.vwma) },
    { name: "HMA", value: fmt(ind.hma), ...sigMa(ind.hma) },
    { name: "Ichimoku 转换线", value: fmt(ind.ichTenkan), ...sigMa(ind.ichTenkan) },
    { name: "Ichimoku 基准线", value: fmt(ind.ichKijun), ...sigMa(ind.ichKijun) },
    { name: "Ichimoku 先行A", value: fmt(ind.ichSenkouA), ...sigMa(ind.ichSenkouA) },
    { name: "Ichimoku 先行B", value: fmt(ind.ichSenkouB), ...sigMa(ind.ichSenkouB) },
  ]
})

const pivotSignals = computed(() => {
  const ind = props.indicators
  return [
    { name: "R3", value: fmt(ind.pivotR3), ...sigPivot(ind.pivotR3) },
    { name: "R2", value: fmt(ind.pivotR2), ...sigPivot(ind.pivotR2) },
    { name: "R1", value: fmt(ind.pivotR1), ...sigPivot(ind.pivotR1) },
    { name: "P (枢轴点)", value: fmt(ind.pivotPP), ...sigPivot(ind.pivotPP) },
    { name: "S1", value: fmt(ind.pivotS1), ...sigPivot(ind.pivotS1) },
    { name: "S2", value: fmt(ind.pivotS2), ...sigPivot(ind.pivotS2) },
    { name: "S3", value: fmt(ind.pivotS3), ...sigPivot(ind.pivotS3) },
  ]
})

function summarize(signals: { signal: string }[]) {
  let buy = 0, sell = 0, neutral = 0
  for (const s of signals) {
    if (s.signal === "买入") buy++
    else if (s.signal === "卖出") sell++
    else neutral++
  }
  return { buy, sell, neutral }
}

const oscillatorSummary = computed(() => summarize(oscillatorSignals.value))
const maSummary = computed(() => summarize(maSignals.value))
const pivotSummary = computed(() => summarize(pivotSignals.value))
</script>

<style scoped>
.signal-tables {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.signal-group {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  padding: 16px;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.group-summary {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.sum-buy { color: #16a34a; }
.sum-sell { color: #dc2626; }
.sum-neutral { color: #64748b; }

.signal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px;
}

.signal-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #f8fafc;
  cursor: help;
}

.sig-name {
  flex: 1;
  font-size: 12px;
  color: #475569;
  border-bottom: 1px dashed #cbd5e1;
}

.sig-value {
  font-size: 12px;
  font-weight: 600;
  color: #1e293b;
  min-width: 70px;
  text-align: right;
}
</style>
