<template>
  <el-row :gutter="12" class="summary-bar">
    <!-- Technical Signals -->
    <el-col :xs="24" :sm="8">
      <el-card shadow="hover" class="summary-card tech-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#5470c6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        <div class="card-body">
          <div class="card-label">技术面信号</div>
          <div class="signal-row" v-if="hasIndicators">
            <el-tag :type="techSentiment.type" size="small" effect="dark">{{ techSentiment.label }}</el-tag>
            <span class="signal-detail">
              <span class="bull-count">{{ bullCount }}多</span> /
              <span class="bear-count">{{ bearCount }}空</span> /
              <span class="neut-count">{{ neutCount }}中</span>
            </span>
          </div>
          <div v-else class="no-data">暂无数据</div>
        </div>
      </el-card>
    </el-col>

    <!-- News Sentiment -->
    <el-col :xs="24" :sm="8">
      <el-card shadow="hover" class="summary-card news-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#e6a23c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </div>
        <div class="card-body">
          <div class="card-label">消息面</div>
          <template v-if="digest">
            <el-tag :type="sentimentType" size="small" effect="dark">{{ sentimentLabel }}</el-tag>
            <div class="news-headline">{{ digest.headline }}</div>
          </template>
          <div v-else class="no-data">暂无消息摘要</div>
        </div>
      </el-card>
    </el-col>

    <!-- Prediction Direction -->
    <el-col :xs="24" :sm="8">
      <el-card shadow="hover" class="summary-card pred-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#67c23a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div class="card-body">
          <div class="card-label">综合方向</div>
          <template v-if="prediction">
            <div class="pred-row">
              <span class="direction-badge" :class="prediction.direction">{{ directionLabel }}</span>
              <el-progress
                :percentage="Math.round(prediction.confidence * 100)"
                :stroke-width="8"
                :color="confidenceColor"
                style="flex:1;min-width:60px"
              />
            </div>
          </template>
          <div v-else class="no-data">暂无预测</div>
        </div>
      </el-card>
    </el-col>
  </el-row>
  <div class="disclaimer">
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
    以上分析仅供参考，不构成投资建议。市场有风险，决策需谨慎。
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { IndicatorValues, LatestPredictionSummary } from "../types/index"
import type { NewsDigest } from "../api/index"

const props = defineProps<{
  indicators: IndicatorValues
  digest: NewsDigest | null
  prediction: LatestPredictionSummary | null
}>()

const hasIndicators = computed(() => {
  const ind = props.indicators
  return ind.rsi14 != null || ind.stochK != null || ind.cci20 != null
})

const bullCount = computed(() => {
  const ind = props.indicators
  let c = 0
  if (ind.rsi14 != null && ind.rsi14 < 30) c++
  if (ind.stochK != null && ind.stochK < 20) c++
  if (ind.cci20 != null && ind.cci20 < -100) c++
  if (ind.ao != null && ind.ao > 0) c++
  if (ind.mom10 != null && ind.mom10 > 0) c++
  return c
})

const bearCount = computed(() => {
  const ind = props.indicators
  let c = 0
  if (ind.rsi14 != null && ind.rsi14 > 70) c++
  if (ind.stochK != null && ind.stochK > 80) c++
  if (ind.cci20 != null && ind.cci20 > 100) c++
  if (ind.ao != null && ind.ao < 0) c++
  if (ind.mom10 != null && ind.mom10 < 0) c++
  return c
})

const neutCount = computed(() => 5 - bullCount.value - bearCount.value)

const techSentiment = computed(() => {
  if (bullCount.value > bearCount.value + 1) return { label: "偏多 ↑", type: "success" as const }
  if (bearCount.value > bullCount.value + 1) return { label: "偏空 ↓", type: "danger" as const }
  return { label: "中性 →", type: "info" as const }
})

const sentimentType = computed(() => {
  if (!props.digest) return "info" as const
  if (props.digest.sentiment === "bullish") return "warning" as const
  if (props.digest.sentiment === "bearish") return "success" as const
  return "info" as const
})

const sentimentLabel = computed(() => {
  if (!props.digest) return "中性"
  if (props.digest.sentiment === "bullish") return "看涨美元 ↑"
  if (props.digest.sentiment === "bearish") return "看跌美元 ↓"
  return "中性 →"
})

const directionLabel = computed(() => {
  if (!props.prediction) return ""
  if (props.prediction.direction === "bullish") return "📈 看多"
  if (props.prediction.direction === "bearish") return "📉 看空"
  return "➡ 震荡"
})

const confidenceColor = computed(() => {
  if (!props.prediction) return "#c0c4cc"
  const c = props.prediction.confidence
  if (c >= 0.7) return "#67c23a"
  if (c >= 0.4) return "#e6a23c"
  return "#909399"
})
</script>

<style scoped>
.summary-bar { margin-bottom: 12px; }

.summary-card {
  border-radius: 8px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 4px 0;
}

.summary-card :deep(.el-card__body) {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
}

.card-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tech-card .card-icon { background: #eef0ff; }
.news-card .card-icon { background: #fef6e8; }
.pred-card .card-icon { background: #edf7ee; }

.card-body {
  flex: 1;
  min-width: 0;
}

.card-label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 4px;
}

.signal-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.signal-detail {
  font-size: 12px;
  color: #606266;
}

.bull-count { color: #67c23a; font-weight: 600; }
.bear-count { color: #f56c6c; font-weight: 600; }
.neut-count { color: #909399; }

.news-headline {
  font-size: 12px;
  color: #303133;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pred-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.direction-badge {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.direction-badge.bullish { color: #67c23a; }
.direction-badge.bearish { color: #f56c6c; }
.direction-badge.neutral { color: #909399; }

.no-data {
  font-size: 12px;
  color: #c0c4cc;
}

.disclaimer {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #c0c4cc;
  padding: 0 4px;
  margin-bottom: 12px;
}
</style>
