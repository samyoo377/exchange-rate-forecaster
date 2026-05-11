<template>
  <el-card shadow="hover" class="prediction-panel">
    <template #header>
      <div class="panel-header">
        <span class="panel-title">综合预测</span>
        <div class="panel-meta">
          <el-tag v-if="prediction?.horizon" size="small" type="info" effect="plain">
            {{ prediction.horizon }}
          </el-tag>
          <span v-if="prediction?.generatedAt" class="time-ago">{{ timeAgo(prediction.generatedAt) }}</span>
        </div>
      </div>
    </template>

    <template v-if="prediction">
      <div class="main-row">
        <div class="direction-block">
          <span class="direction-arrow" :class="prediction.direction">
            {{ prediction.direction === 'bullish' ? '▲' : prediction.direction === 'bearish' ? '▼' : '◆' }}
          </span>
          <div class="direction-info">
            <span class="direction-label" :class="prediction.direction">
              {{ dirLabel(prediction.direction) }} USD/CNH
            </span>
            <span class="confidence-text">置信度 {{ Math.round(prediction.confidence * 100) }}%</span>
          </div>
        </div>
        <div v-if="prediction.compositeScore != null" class="score-block">
          <div class="score-value" :class="scoreClass">
            {{ prediction.compositeScore > 0 ? '+' : '' }}{{ prediction.compositeScore.toFixed(0) }}
          </div>
          <div class="score-label">综合评分</div>
        </div>
      </div>

      <div v-if="prediction.breakdown" class="breakdown-row">
        <div class="source-bar" v-for="src in sources" :key="src.key">
          <div class="source-header">
            <span class="source-name">{{ src.label }}</span>
            <span class="source-score" :class="src.scoreClass">
              {{ src.score > 0 ? '+' : '' }}{{ src.score.toFixed(0) }}
            </span>
          </div>
          <el-progress :percentage="src.pct" :stroke-width="6" :show-text="false" :color="src.color" />
        </div>
      </div>

      <div v-if="prediction.rationale?.length" class="rationale-section">
        <div v-for="(r, i) in prediction.rationale.slice(0, 3)" :key="i" class="rationale-item">
          <span class="bullet">•</span> {{ r }}
        </div>
      </div>

      <div class="panel-footer">
        <el-button size="small" text type="primary" @click="drawerVisible = true">查看详情</el-button>
        <div v-if="prediction.dataFreshness" class="freshness">
          <span class="freshness-dot" :class="freshnessClass"></span>
          <span class="freshness-text">数据{{ freshnessLabel }}</span>
        </div>
      </div>
    </template>
    <el-empty v-else description="暂无预测数据" :image-size="60" />

    <PredictionDetailDrawer v-model="drawerVisible" :prediction="prediction" />
  </el-card>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import type { DashboardPrediction } from "../api/index"
import PredictionDetailDrawer from "./PredictionDetailDrawer.vue"

const props = defineProps<{ prediction: DashboardPrediction | null }>()
const drawerVisible = ref(false)

function dirLabel(d: string) {
  return d === "bullish" ? "看多" : d === "bearish" ? "看空" : "震荡"
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${mins}分钟前`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}小时前`
  return `${Math.round(hrs / 24)}天前`
}

const scoreClass = computed(() => {
  const s = props.prediction?.compositeScore ?? 0
  return s > 15 ? "bullish" : s < -15 ? "bearish" : "neutral"
})

const sources = computed(() => {
  const b = props.prediction?.breakdown
  if (!b) return []
  return [
    {
      key: "quant",
      label: "量化",
      score: b.quant.score,
      pct: Math.min(100, Math.abs(b.quant.score)),
      color: b.quant.score > 0 ? "#67c23a" : b.quant.score < 0 ? "#f56c6c" : "#909399",
      scoreClass: b.quant.score > 10 ? "bullish" : b.quant.score < -10 ? "bearish" : "neutral",
    },
    {
      key: "technical",
      label: "技术",
      score: b.technical.score,
      pct: Math.min(100, Math.abs(b.technical.score)),
      color: b.technical.score > 0 ? "#67c23a" : b.technical.score < 0 ? "#f56c6c" : "#909399",
      scoreClass: b.technical.score > 10 ? "bullish" : b.technical.score < -10 ? "bearish" : "neutral",
    },
    {
      key: "news",
      label: "消息",
      score: b.news.score,
      pct: Math.min(100, Math.abs(b.news.score)),
      color: b.news.score > 0 ? "#67c23a" : b.news.score < 0 ? "#f56c6c" : "#909399",
      scoreClass: b.news.score > 10 ? "bullish" : b.news.score < -10 ? "bearish" : "neutral",
    },
  ]
})

const freshnessClass = computed(() => {
  const f = props.prediction?.dataFreshness
  if (!f) return "stale"
  if (f.overallFresh) return "fresh"
  if (f.quantAge < 720 || f.newsAge < 1440) return "moderate"
  return "stale"
})

const freshnessLabel = computed(() => {
  const cls = freshnessClass.value
  return cls === "fresh" ? "新鲜" : cls === "moderate" ? "一般" : "陈旧"
})
</script>

<style scoped>
.prediction-panel { border-radius: 10px; }

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-title { font-weight: 600; font-size: 14px; }
.panel-meta { display: flex; align-items: center; gap: 8px; }
.time-ago { font-size: 11px; color: #909399; }

.main-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.direction-block { display: flex; align-items: center; gap: 12px; }
.direction-arrow { font-size: 28px; line-height: 1; }
.direction-arrow.bullish { color: #67c23a; }
.direction-arrow.bearish { color: #f56c6c; }
.direction-arrow.neutral { color: #909399; }

.direction-info { display: flex; flex-direction: column; gap: 2px; }
.direction-label { font-size: 16px; font-weight: 700; }
.direction-label.bullish { color: #67c23a; }
.direction-label.bearish { color: #f56c6c; }
.direction-label.neutral { color: #606266; }
.confidence-text { font-size: 12px; color: #909399; }

.score-block { text-align: center; }
.score-value { font-size: 24px; font-weight: 700; }
.score-value.bullish { color: #67c23a; }
.score-value.bearish { color: #f56c6c; }
.score-value.neutral { color: #909399; }
.score-label { font-size: 11px; color: #909399; }

.breakdown-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}

.source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.source-name { font-size: 12px; color: #606266; }
.source-score { font-size: 12px; font-weight: 600; }
.source-score.bullish { color: #67c23a; }
.source-score.bearish { color: #f56c6c; }
.source-score.neutral { color: #909399; }

.rationale-section {
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 12px;
}
.rationale-item {
  font-size: 12px;
  color: #606266;
  line-height: 1.8;
}
.bullet { color: #409eff; margin-right: 4px; }

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.freshness { display: flex; align-items: center; gap: 4px; }
.freshness-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.freshness-dot.fresh { background: #67c23a; }
.freshness-dot.moderate { background: #e6a23c; }
.freshness-dot.stale { background: #f56c6c; }
.freshness-text { font-size: 11px; color: #909399; }
</style>
