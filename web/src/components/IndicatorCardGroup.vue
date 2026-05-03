<template>
  <el-card class="card" shadow="never">
    <template #header><span class="card-title">技术指标快照</span></template>
    <el-row :gutter="8">
      <el-col :span="8" v-for="item in items" :key="item.label">
        <div class="ind-item">
          <div class="ind-label">{{ item.label }}</div>
          <div class="ind-value" :style="{ color: item.color }">
            {{ item.value }}
          </div>
          <el-tag :type="item.signalType" size="small">{{ item.signal }}</el-tag>
        </div>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { IndicatorValues } from "../types/index"

const props = defineProps<{ indicators: IndicatorValues }>()

function fmt(v: number | undefined, dec = 2) {
  return v == null ? "—" : v.toFixed(dec)
}

type TagType = "success" | "danger" | "warning" | "info"

function rsiSignal(v?: number): { text: string; type: TagType } {
  if (v == null) return { text: "无数据", type: "info" }
  if (v < 30) return { text: "超卖", type: "success" }
  if (v > 70) return { text: "超买", type: "danger" }
  return { text: "中性", type: "info" }
}

function stochSignal(v?: number): { text: string; type: TagType } {
  if (v == null) return { text: "无数据", type: "info" }
  if (v < 20) return { text: "超卖", type: "success" }
  if (v > 80) return { text: "超买", type: "danger" }
  return { text: "中性", type: "info" }
}

function cciSignal(v?: number): { text: string; type: TagType } {
  if (v == null) return { text: "无数据", type: "info" }
  if (v < -100) return { text: "超卖", type: "success" }
  if (v > 100) return { text: "超买", type: "danger" }
  return { text: "中性", type: "info" }
}

function adxSignal(v?: number): { text: string; type: TagType } {
  if (v == null) return { text: "无数据", type: "info" }
  if (v > 25) return { text: "强趋势", type: "warning" }
  return { text: "弱趋势", type: "info" }
}

function aoSignal(v?: number): { text: string; type: TagType } {
  if (v == null) return { text: "无数据", type: "info" }
  if (v > 0) return { text: "偏多", type: "success" }
  if (v < 0) return { text: "偏空", type: "danger" }
  return { text: "中性", type: "info" }
}

function momSignal(v?: number): { text: string; type: TagType } {
  if (v == null) return { text: "无数据", type: "info" }
  if (v > 0) return { text: "偏多", type: "success" }
  if (v < 0) return { text: "偏空", type: "danger" }
  return { text: "中性", type: "info" }
}

const items = computed(() => {
  const ind = props.indicators
  return [
    { label: "RSI(14)", value: fmt(ind.rsi14), color: "#303133", ...rsiSignal(ind.rsi14), signalType: rsiSignal(ind.rsi14).type, signal: rsiSignal(ind.rsi14).text },
    { label: "Stoch %K", value: fmt(ind.stochK), color: "#303133", ...stochSignal(ind.stochK), signalType: stochSignal(ind.stochK).type, signal: stochSignal(ind.stochK).text },
    { label: "CCI(20)", value: fmt(ind.cci20), color: "#303133", ...cciSignal(ind.cci20), signalType: cciSignal(ind.cci20).type, signal: cciSignal(ind.cci20).text },
    { label: "ADX(14)", value: fmt(ind.adx14), color: "#303133", ...adxSignal(ind.adx14), signalType: adxSignal(ind.adx14).type, signal: adxSignal(ind.adx14).text },
    { label: "AO", value: fmt(ind.ao, 5), color: (ind.ao ?? 0) >= 0 ? "#67c23a" : "#f56c6c", ...aoSignal(ind.ao), signalType: aoSignal(ind.ao).type, signal: aoSignal(ind.ao).text },
    { label: "MOM(10)", value: fmt(ind.mom10, 4), color: (ind.mom10 ?? 0) >= 0 ? "#67c23a" : "#f56c6c", ...momSignal(ind.mom10), signalType: momSignal(ind.mom10).type, signal: momSignal(ind.mom10).text },
  ]
})
</script>

<style scoped>
.card { border-radius: 8px; }
.card-title { font-size: 13px; font-weight: 600; color: #303133; }
.ind-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  border-radius: 6px;
  background: #fafafa;
  margin-bottom: 8px;
  gap: 4px;
}
.ind-label { font-size: 11px; color: #909399; }
.ind-value { font-size: 16px; font-weight: 700; }
</style>
