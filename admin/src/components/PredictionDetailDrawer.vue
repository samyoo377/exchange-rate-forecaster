<template>
  <el-drawer v-model="visible" title="预测详情" size="480px" direction="rtl">
    <template v-if="prediction">
      <el-descriptions :column="2" border size="small" class="desc-block">
        <el-descriptions-item label="方向">
          <el-tag :type="dirType(prediction.direction)" effect="dark" size="small">
            {{ dirLabel(prediction.direction) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="置信度">
          {{ Math.round(prediction.confidence * 100) }}%
        </el-descriptions-item>
        <el-descriptions-item label="综合评分">
          <span :class="scoreClass">
            {{ (prediction.compositeScore ?? 0) > 0 ? '+' : '' }}{{ (prediction.compositeScore ?? 0).toFixed(1) }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="周期">{{ prediction.horizon }}</el-descriptions-item>
        <el-descriptions-item label="生成时间" :span="2">
          {{ prediction.generatedAt ? new Date(prediction.generatedAt).toLocaleString('zh-CN') : '-' }}
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="prediction.breakdown" class="section">
        <div class="section-title">信号源明细</div>

        <div class="source-detail">
          <div class="source-detail-header">
            <span class="sd-label">量化7策略</span>
            <el-tag size="small" effect="plain" type="info">{{ prediction.breakdown.quant.regime }}</el-tag>
            <span class="sd-score" :class="qClass">
              {{ prediction.breakdown.quant.score > 0 ? '+' : '' }}{{ prediction.breakdown.quant.score.toFixed(1) }}
            </span>
          </div>
          <div v-if="prediction.breakdown.quant.topSignals.length" class="signal-list">
            <div v-for="s in prediction.breakdown.quant.topSignals" :key="s.name" class="signal-item">
              <span class="signal-name">{{ s.name }}</span>
              <span class="signal-score" :class="s.direction">{{ s.score > 0 ? '+' : '' }}{{ s.score.toFixed(0) }}</span>
            </div>
          </div>
          <div v-if="prediction.breakdown.quant.snapshotAge >= 0" class="age-note">
            {{ formatAge(prediction.breakdown.quant.snapshotAge) }}前更新
          </div>
        </div>

        <div class="source-detail">
          <div class="source-detail-header">
            <span class="sd-label">技术面指标</span>
            <span class="sd-score" :class="tClass">
              {{ prediction.breakdown.technical.score > 0 ? '+' : '' }}{{ prediction.breakdown.technical.score.toFixed(1) }}
            </span>
          </div>
          <div class="signal-list">
            <div v-for="(val, key) in prediction.breakdown.technical.signals" :key="key" class="signal-item">
              <span class="signal-name">{{ key.toUpperCase() }}</span>
              <el-tag :type="sigType(val)" size="small" effect="plain">{{ sigLabel(val) }}</el-tag>
            </div>
          </div>
        </div>

        <div class="source-detail">
          <div class="source-detail-header">
            <span class="sd-label">消息面</span>
            <span class="sd-score" :class="nClass">
              {{ prediction.breakdown.news.score > 0 ? '+' : '' }}{{ prediction.breakdown.news.score.toFixed(1) }}
            </span>
          </div>
          <div v-if="prediction.breakdown.news.headline" class="news-headline">
            {{ prediction.breakdown.news.headline }}
          </div>
          <div v-if="prediction.breakdown.news.topFactors.length" class="signal-list">
            <div v-for="f in prediction.breakdown.news.topFactors" :key="f.factor" class="signal-item">
              <span class="signal-name">{{ f.factor }}</span>
              <span class="signal-score" :class="f.direction">{{ f.score > 0 ? '+' : '' }}{{ f.score.toFixed(2) }}</span>
            </div>
          </div>
          <div v-if="prediction.breakdown.news.digestAge >= 0" class="age-note">
            {{ formatAge(prediction.breakdown.news.digestAge) }}前更新
          </div>
        </div>
      </div>

      <div v-if="prediction.recentHistory?.length" class="section">
        <div class="section-title">近期预测趋势</div>
        <div class="history-list">
          <div v-for="h in prediction.recentHistory" :key="h.date" class="history-item">
            <span class="history-date">{{ formatShortDate(h.date) }}</span>
            <el-tag :type="dirType(h.direction)" size="small" effect="plain">
              {{ dirLabel(h.direction) }}
            </el-tag>
            <span class="history-score" :class="h.compositeScore > 15 ? 'bullish' : h.compositeScore < -15 ? 'bearish' : 'neutral'">
              {{ h.compositeScore > 0 ? '+' : '' }}{{ h.compositeScore.toFixed(0) }}
            </span>
            <span class="history-conf">{{ Math.round(h.confidence * 100) }}%</span>
          </div>
        </div>
      </div>

      <div v-if="prediction.rationale?.length" class="section">
        <div class="section-title">分析依据</div>
        <div class="rationale-list">
          <div v-for="(r, i) in prediction.rationale" :key="i" class="rationale-row">{{ r }}</div>
        </div>
      </div>

      <div class="section risk-section">
        <div class="section-title">风险提示</div>
        <div class="risk-text">
          本预测基于技术指标、量化策略和消息面三源融合，仅作为策略辅助参考，不构成交易建议。突发政策或宏观事件可能导致预测短时失效。
        </div>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { DashboardPrediction } from "../api/index"

const visible = defineModel<boolean>()
const props = defineProps<{ prediction: DashboardPrediction | null }>()

function dirLabel(d: string) {
  return d === "bullish" ? "看多" : d === "bearish" ? "看空" : "震荡"
}
function dirType(d: string) {
  return d === "bullish" ? "success" : d === "bearish" ? "danger" : "info"
}
function sigType(s: string) {
  return s === "buy" ? "success" : s === "sell" ? "danger" : "info"
}
function sigLabel(s: string) {
  return s === "buy" ? "买入" : s === "sell" ? "卖出" : "中性"
}

function formatAge(mins: number) {
  if (mins < 60) return `${mins}分钟`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}小时`
  return `${Math.round(hrs / 24)}天`
}

function formatShortDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

const scoreClass = computed(() => {
  const s = props.prediction?.compositeScore ?? 0
  return s > 15 ? "bullish" : s < -15 ? "bearish" : "neutral"
})
const qClass = computed(() => {
  const s = props.prediction?.breakdown?.quant.score ?? 0
  return s > 10 ? "bullish" : s < -10 ? "bearish" : "neutral"
})
const tClass = computed(() => {
  const s = props.prediction?.breakdown?.technical.score ?? 0
  return s > 10 ? "bullish" : s < -10 ? "bearish" : "neutral"
})
const nClass = computed(() => {
  const s = props.prediction?.breakdown?.news.score ?? 0
  return s > 10 ? "bullish" : s < -10 ? "bearish" : "neutral"
})
</script>

<style scoped>
.desc-block { margin-bottom: 16px; }

.section { margin-bottom: 18px; }
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 10px;
}

.source-detail {
  padding: 10px 12px;
  background: #fafbfc;
  border-radius: 8px;
  margin-bottom: 8px;
}
.source-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.sd-label { font-size: 13px; font-weight: 600; color: #303133; flex: 1; }
.sd-score { font-size: 14px; font-weight: 700; }

.signal-list { display: flex; flex-wrap: wrap; gap: 6px; }
.signal-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.signal-name { color: #606266; }
.signal-score { font-weight: 600; }
.signal-score.bullish { color: #67c23a; }
.signal-score.bearish { color: #f56c6c; }
.signal-score.neutral { color: #909399; }

.age-note { font-size: 11px; color: #c0c4cc; margin-top: 4px; }

.news-headline {
  font-size: 12px;
  color: #606266;
  margin-bottom: 6px;
  line-height: 1.5;
}

.history-list { display: flex; flex-direction: column; gap: 4px; }
.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: #fafbfc;
}
.history-date { color: #909399; width: 80px; flex-shrink: 0; }
.history-score { font-weight: 600; }
.history-score.bullish { color: #67c23a; }
.history-score.bearish { color: #f56c6c; }
.history-score.neutral { color: #909399; }
.history-conf { color: #c0c4cc; margin-left: auto; }

.rationale-list { display: flex; flex-direction: column; gap: 4px; }
.rationale-row {
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
  padding: 4px 0;
  border-bottom: 1px solid #f0f0f0;
}
.rationale-row:last-child { border-bottom: none; }

.risk-section { margin-top: 20px; }
.risk-text {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
  padding: 10px 12px;
  background: #fef0f0;
  border-radius: 6px;
}

.bullish { color: #67c23a; }
.bearish { color: #f56c6c; }
.neutral { color: #909399; }
</style>
