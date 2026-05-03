<template>
  <el-card class="card" shadow="never">
    <template #header><span class="card-title">最新预测</span></template>
    <div v-if="!prediction" class="empty-state">
      <el-empty description="暂无预测数据" :image-size="50" />
    </div>
    <div v-else class="pred-content">
      <div :class="['dir-badge', prediction.direction]">
        {{ dirLabel }}
      </div>
      <div class="conf-row">
        <span class="conf-label">置信度</span>
        <el-progress
          :percentage="Math.round(prediction.confidence * 100)"
          :color="progressColor"
          :stroke-width="8"
          style="flex:1"
        />
      </div>
      <div class="horizon-row">
        <el-tag size="small" type="info">{{ prediction.horizon }}</el-tag>
      </div>
      <div class="disclaimer">⚠ 仅供策略参考，非交易建议</div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { LatestPredictionSummary } from "../types/index"

const props = defineProps<{ prediction: LatestPredictionSummary | null }>()

const dirLabel = computed(() => {
  const d = props.prediction?.direction
  return d === "bullish" ? "📈 看多" : d === "bearish" ? "📉 看空" : "➡ 震荡"
})

const progressColor = computed(() => {
  const c = props.prediction?.confidence ?? 0
  if (c >= 0.7) return "#67c23a"
  if (c >= 0.4) return "#e6a23c"
  return "#909399"
})
</script>

<style scoped>
.card { border-radius: 8px; height: 100%; }
.card-title { font-size: 13px; font-weight: 600; color: #303133; }
.empty-state { display: flex; justify-content: center; }
.pred-content { display: flex; flex-direction: column; gap: 10px; }
.dir-badge {
  font-size: 22px;
  font-weight: 700;
  text-align: center;
  padding: 12px 0;
  border-radius: 6px;
}
.dir-badge.bullish { background: #f0f9eb; color: #67c23a; }
.dir-badge.bearish { background: #fef0f0; color: #f56c6c; }
.dir-badge.neutral { background: #f4f4f5; color: #909399; }
.conf-row { display: flex; align-items: center; gap: 8px; }
.conf-label { font-size: 12px; color: #606266; white-space: nowrap; }
.horizon-row { display: flex; justify-content: center; }
.disclaimer { font-size: 11px; color: #f56c6c; text-align: center; }
</style>
