<template>
  <div class="pred-detail" v-if="prediction">
    <el-divider style="margin:8px 0" />
    <div class="detail-row">
      <span class="detail-label">方向</span>
      <el-tag :type="dirTagType" size="small">{{ dirLabel }}</el-tag>
    </div>
    <div class="detail-row">
      <span class="detail-label">置信度</span>
      <el-progress
        :percentage="Math.round(prediction.confidence * 100)"
        :color="progressColor"
        :stroke-width="6"
        style="width:120px"
      />
    </div>
    <div class="detail-section">
      <div class="detail-label">关键依据</div>
      <ul class="detail-list">
        <li v-for="r in prediction.rationale" :key="r">{{ r }}</li>
      </ul>
    </div>
    <div class="detail-section">
      <div class="detail-label risk">风险提示</div>
      <ul class="detail-list risk-list">
        <li v-for="n in prediction.riskNotes" :key="n">{{ n }}</li>
      </ul>
    </div>
    <div class="disclaimer">⚠ 本预测仅作策略辅助参考，不构成任何交易建议</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { PredictionResult } from "../types/index"

const props = defineProps<{ prediction: PredictionResult }>()

const dirLabel = computed(() => {
  const d = props.prediction?.direction
  return d === "bullish" ? "看多（偏升）" : d === "bearish" ? "看空（偏贬）" : "中性（震荡）"
})

const dirTagType = computed(() => {
  const d = props.prediction?.direction
  return d === "bullish" ? "success" : d === "bearish" ? "danger" : "info"
})

const progressColor = computed(() => {
  const c = props.prediction?.confidence ?? 0
  if (c >= 0.7) return "#67c23a"
  if (c >= 0.4) return "#e6a23c"
  return "#909399"
})
</script>

<style scoped>
.pred-detail { font-size: 12px; }
.detail-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.detail-label { color: #606266; font-weight: 500; min-width: 48px; }
.detail-label.risk { color: #e6a23c; }
.detail-section { margin-bottom: 6px; }
.detail-list { margin: 4px 0 0 14px; color: #303133; line-height: 1.7; }
.risk-list { color: #e6a23c; }
.disclaimer {
  font-size: 11px;
  color: #f56c6c;
  margin-top: 6px;
  padding: 4px 8px;
  background: #fef0f0;
  border-radius: 4px;
}
</style>
