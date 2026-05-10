<template>
  <div class="quant-panel">
    <div class="panel-header">
      <h3 class="panel-title">量化信号面板</h3>
      <div class="panel-actions">
        <el-button size="small" :loading="quantStore.loading" @click="handleRefresh">
          刷新
        </el-button>
        <el-button size="small" type="text" @click="collapsed = !collapsed">
          {{ collapsed ? "展开" : "收起" }}
        </el-button>
      </div>
    </div>

    <el-collapse-transition>
      <div v-show="!collapsed" class="panel-body">
        <div v-if="quantStore.loading && !quantStore.latest" class="loading-state">
          <el-skeleton :rows="4" animated />
        </div>

        <div v-else-if="quantStore.error" class="error-state">
          <p>{{ quantStore.error }}</p>
          <el-button size="small" @click="handleRefresh">重试</el-button>
        </div>

        <div v-else-if="!quantStore.latest" class="empty-state">
          <p>暂无量化信号数据</p>
          <el-button size="small" type="primary" @click="handleTrigger">
            立即计算
          </el-button>
        </div>

        <template v-else>
          <div class="signal-overview">
            <div class="score-section">
              <el-tooltip content="所有量化信号的加权综合得分。正值看涨，负值看跌，绝对值越大信号越强" placement="top" :show-after="300">
                <div class="composite-score" :class="scoreClass">
                  <span class="score-value">
                    {{ quantStore.latest.compositeScore > 0 ? "+" : "" }}{{ quantStore.latest.compositeScore.toFixed(1) }}
                  </span>
                  <span class="score-label">综合评分</span>
                </div>
              </el-tooltip>
              <div class="score-meta">
                <el-tooltip content="综合评分判定的市场方向：偏多表示看涨，偏空表示看跌，中性表示方向不明" placement="top" :show-after="300">
                  <div class="meta-item">
                    <span class="meta-label">方向</span>
                    <span class="meta-value" :class="directionClass">{{ directionLabel }}</span>
                  </div>
                </el-tooltip>
                <el-tooltip content="当前市场所处阶段：上升/下降趋势、震荡或高波动，影响策略选择" placement="top" :show-after="300">
                  <div class="meta-item">
                    <span class="meta-label">市场状态</span>
                    <span class="meta-value">{{ regimeLabel }}</span>
                  </div>
                </el-tooltip>
                <el-tooltip content="模型对当前判断的确信程度。越高表示各信号越一致，预测越可靠" placement="top" :show-after="300">
                  <div class="meta-item">
                    <span class="meta-label">置信度</span>
                    <span class="meta-value">{{ (quantStore.latest.confidence * 100).toFixed(0) }}%</span>
                  </div>
                </el-tooltip>
              </div>
            </div>

            <div class="radar-section">
              <QuantRadarChart :signals="quantStore.latest.signals" />
            </div>
          </div>

          <div class="signal-cards">
            <el-tooltip
              v-for="signal in sortedSignals"
              :key="signal.name"
              :content="signalTooltip(signal.name)"
              placement="top"
              :show-after="300"
            >
              <div
                class="signal-card"
                :class="signalCardClass(signal.score)"
              >
                <span class="signal-name">{{ signalLabel(signal.name) }}</span>
                <span class="signal-score" :class="signalScoreClass(signal.score)">
                  {{ signal.score > 0 ? "+" : "" }}{{ signal.score.toFixed(0) }}
                </span>
              </div>
            </el-tooltip>
          </div>

          <div class="source-status">
            <div class="source-row">
              <span class="source-label">数据源:</span>
              <span
                v-for="src in quantStore.sourcesHealth"
                :key="src.name"
                class="source-badge"
                :class="src.healthy ? 'healthy' : 'unhealthy'"
              >
                {{ src.healthy ? "✓" : "!" }} {{ src.name }}
              </span>
            </div>
            <span class="update-time">
              更新: {{ formatTime(quantStore.latest.createdAt) }}
            </span>
          </div>
        </template>
      </div>
    </el-collapse-transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { useQuantStore } from "../stores/quant"
import QuantRadarChart from "./QuantRadarChart.vue"
import type { QuantSignalItem } from "../stores/quant"

const quantStore = useQuantStore()
const collapsed = ref(false)

const SIGNAL_LABELS: Record<string, string> = {
  maCrossover: "MA交叉",
  bollingerBands: "布林带",
  macd: "MACD",
  supportResistance: "支撑阻力",
  volatility: "波动率",
  meanReversion: "均值回归",
  momentum: "动量",
}

const SIGNAL_TOOLTIPS: Record<string, string> = {
  maCrossover: "短期均线与长期均线的交叉信号。金叉（短上穿长）看涨，死叉（短下穿长）看跌",
  bollingerBands: "价格相对布林带上下轨的位置。触及上轨可能超买，触及下轨可能超卖",
  macd: "趋势动量指标。MACD柱由负转正为买入信号，由正转负为卖出信号",
  supportResistance: "关键价格支撑位和阻力位。接近支撑位可能反弹，接近阻力位可能回落",
  volatility: "市场波动剧烈程度。高波动意味着风险和机会并存，低波动可能酝酿突破",
  meanReversion: "价格偏离均值的程度。偏离过大时倾向于回归均值，可作为反转信号",
  momentum: "价格变化的速度和力度。正动量表示上涨加速，负动量表示下跌加速",
}

const REGIME_LABELS: Record<string, string> = {
  trending_up: "上升趋势",
  trending_down: "下降趋势",
  ranging: "震荡",
  volatile: "高波动",
}

const scoreClass = computed(() => {
  const score = quantStore.latest?.compositeScore ?? 0
  if (score > 20) return "bullish"
  if (score < -20) return "bearish"
  return "neutral"
})

const directionLabel = computed(() => {
  const score = quantStore.latest?.compositeScore ?? 0
  if (score > 20) return "偏多"
  if (score < -20) return "偏空"
  return "中性"
})

const directionClass = computed(() => scoreClass.value)

const regimeLabel = computed(() =>
  REGIME_LABELS[quantStore.latest?.regime ?? ""] ?? quantStore.latest?.regime ?? "-"
)

const sortedSignals = computed(() =>
  [...(quantStore.latest?.signals ?? [])].sort(
    (a, b) => Math.abs(b.score) - Math.abs(a.score)
  )
)

function signalLabel(name: string): string {
  return SIGNAL_LABELS[name] ?? name
}

function signalTooltip(name: string): string {
  return SIGNAL_TOOLTIPS[name] ?? `${signalLabel(name)}指标信号`
}

function signalCardClass(score: number): string {
  if (score > 20) return "card-bullish"
  if (score < -20) return "card-bearish"
  return "card-neutral"
}

function signalScoreClass(score: number): string {
  if (score > 0) return "positive"
  if (score < 0) return "negative"
  return ""
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
}

async function handleRefresh() {
  await Promise.all([
    quantStore.fetchLatest(),
    quantStore.fetchSourcesHealth(),
  ])
}

async function handleTrigger() {
  await quantStore.triggerAnalysis()
}

onMounted(() => {
  quantStore.fetchLatest()
  quantStore.fetchSourcesHealth()
})
</script>

<style scoped>
.quant-panel {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.panel-body {
  padding: 16px;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 24px 0;
  color: #64748b;
}

.signal-overview {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.score-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.composite-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  border-radius: 8px;
  background: #f8fafc;
}

.composite-score.bullish { background: #f0fdf4; }
.composite-score.bearish { background: #fef2f2; }
.composite-score.neutral { background: #f8fafc; }

.score-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}

.bullish .score-value { color: #16a34a; }
.bearish .score-value { color: #dc2626; }
.neutral .score-value { color: #64748b; }

.score-label {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

.score-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.meta-label { color: #94a3b8; }
.meta-value { color: #334155; font-weight: 500; }
.meta-value.bullish { color: #16a34a; }
.meta-value.bearish { color: #dc2626; }
.meta-value.neutral { color: #64748b; }

.radar-section {
  min-height: 260px;
}

.signal-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.signal-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  border: 1px solid #e2e8f0;
}

.card-bullish { background: #f0fdf4; border-color: #bbf7d0; }
.card-bearish { background: #fef2f2; border-color: #fecaca; }
.card-neutral { background: #f8fafc; border-color: #e2e8f0; }

.signal-name { color: #475569; }
.signal-score { font-weight: 600; }
.signal-score.positive { color: #16a34a; }
.signal-score.negative { color: #dc2626; }

.source-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
  font-size: 12px;
  color: #94a3b8;
}

.source-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.source-badge.healthy { background: #f0fdf4; color: #16a34a; }
.source-badge.unhealthy { background: #fef2f2; color: #dc2626; }
</style>
