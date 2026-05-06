<template>
  <el-card class="card" shadow="never">
    <template #header><span class="card-title">技术指标快照</span></template>

    <el-collapse v-model="expandedGroups">
      <el-collapse-item v-for="group in groups" :key="group.key" :name="group.key">
        <template #title>
          <div class="group-header">
            <span v-if="group.color" class="group-dot" :style="{ background: group.color }" />
            <span class="group-title">{{ group.label }}</span>
            <el-tag size="small" type="info" effect="plain" class="group-count">{{ group.items.length }}</el-tag>
          </div>
        </template>
        <el-row :gutter="8">
          <el-col :span="colSpan(group.items.length)" v-for="item in group.items" :key="item.label">
            <div class="ind-item">
              <div class="ind-label">{{ item.label }}</div>
              <div class="ind-value" :style="{ color: item.color }">
                {{ item.value }}
              </div>
              <el-tag :type="item.signalType" size="small">{{ item.signal }}</el-tag>
            </div>
          </el-col>
        </el-row>
      </el-collapse-item>
    </el-collapse>
  </el-card>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import type { IndicatorValues } from "../types/index"
import type { IndicatorConfigInfo } from "../api/index"

const props = defineProps<{ indicators: IndicatorValues; configs?: IndicatorConfigInfo[] }>()

function fmt(v: number | undefined, dec = 2) {
  return v == null ? "—" : v.toFixed(dec)
}

type TagType = "success" | "danger" | "warning" | "info"

interface CardItem {
  label: string
  value: string
  color: string
  signalType: TagType
  signal: string
}

interface GroupDef {
  key: string
  label: string
  color: string | null
  sortOrder: number
  items: CardItem[]
}

const CATEGORY_LABELS: Record<string, string> = {
  momentum: "动量指标",
  trend: "趋势指标",
  volatility: "波动率指标",
  support_resist: "支撑阻力",
  custom: "自定义指标",
}

function genericSignal(v: number | undefined, th: Record<string, any>): { text: string; type: TagType } {
  if (v == null) return { text: "无数据", type: "info" }
  if (th.buyBelow != null && v < th.buyBelow) return { text: "超卖", type: "success" }
  if (th.sellAbove != null && v > th.sellAbove) return { text: "超买", type: "danger" }
  if (th.strongTrendAbove != null && v > th.strongTrendAbove) return { text: "强趋势", type: "warning" }
  if (th.zeroCross) {
    if (v > 0) return { text: "偏多", type: "success" }
    if (v < 0) return { text: "偏空", type: "danger" }
  }
  if (v > 0) return { text: "偏多", type: "success" }
  if (v < 0) return { text: "偏空", type: "danger" }
  return { text: "中性", type: "info" }
}

const BUILTIN_MAP: Record<string, { key: string; dec: number }> = {
  RSI: { key: "rsi14", dec: 2 },
  STOCH: { key: "stochK", dec: 2 },
  CCI: { key: "cci20", dec: 2 },
  ADX: { key: "adx14", dec: 2 },
  AO: { key: "ao", dec: 5 },
  MOM: { key: "mom10", dec: 4 },
}

const groups = computed((): GroupDef[] => {
  const ind = props.indicators as Record<string, any>
  const cfgs = props.configs ?? []
  const groupMap = new Map<string, GroupDef>()

  for (const cfg of cfgs) {
    const gKey = cfg.groupId ?? cfg.category1 ?? "custom"
    const gLabel = cfg.groupName ?? CATEGORY_LABELS[cfg.category1 ?? "custom"] ?? cfg.category1 ?? "自定义"

    if (!groupMap.has(gKey)) {
      groupMap.set(gKey, {
        key: gKey,
        label: gLabel,
        color: cfg.groupColor,
        sortOrder: cfg.groupSortOrder ?? 999,
        items: [],
      })
    }

    const builtin = BUILTIN_MAP[cfg.indicatorType]
    const v = builtin
      ? (ind[builtin.key] as number | undefined)
      : (ind[cfg.dataKeys[0]] as number | undefined)
    const dec = builtin?.dec ?? 4
    const sig = genericSignal(v, cfg.signalThresholds)
    const isValueIndicator = builtin?.key === "ao" || builtin?.key === "mom10" || !builtin

    groupMap.get(gKey)!.items.push({
      label: cfg.displayName || cfg.indicatorType,
      value: fmt(v, dec),
      color: v == null ? "#303133" : isValueIndicator ? (v >= 0 ? "#67c23a" : "#f56c6c") : "#303133",
      signalType: sig.type,
      signal: sig.text,
    })
  }

  if (groupMap.size === 0) {
    const defaultGroup: GroupDef = { key: "default", label: "技术指标", color: null, sortOrder: 0, items: [] }
    for (const [type, b] of Object.entries(BUILTIN_MAP)) {
      const v = ind[b.key] as number | undefined
      const sig = genericSignal(v, {})
      defaultGroup.items.push({
        label: type,
        value: fmt(v, b.dec),
        color: "#303133",
        signalType: sig.type,
        signal: sig.text,
      })
    }
    return [defaultGroup]
  }

  return [...groupMap.values()].sort((a, b) => a.sortOrder - b.sortOrder)
})

const expandedGroups = ref<string[]>([])

const initialGroupKeys = computed(() => groups.value.map((g) => g.key))
expandedGroups.value = initialGroupKeys.value

function colSpan(count: number) {
  if (count <= 3) return 8
  if (count <= 6) return 8
  return 6
}
</script>

<style scoped>
.card { border-radius: 8px; }
.card-title { font-size: 13px; font-weight: 600; color: #303133; }

.group-header {
  display: flex; align-items: center; gap: 6px;
}
.group-dot {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  flex-shrink: 0;
}
.group-title {
  font-size: 13px; font-weight: 600; color: #303133;
}
.group-count { margin-left: 4px; }

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

:deep(.el-collapse-item__header) {
  height: 36px;
  line-height: 36px;
  font-size: 13px;
}
:deep(.el-collapse-item__content) {
  padding-bottom: 4px;
}
</style>
