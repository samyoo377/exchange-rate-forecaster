<template>
  <div class="history-page">
    <el-card shadow="never" class="page-card">
      <template #header>
        <el-space>
          <span class="page-title">预测历史记录</span>
          <el-button size="small" @click="load(1)">刷新</el-button>
        </el-space>
      </template>

      <el-table :data="list" v-loading="loading" stripe size="small">
        <el-table-column prop="createdAt" label="时间" width="170">
          <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="horizon" label="周期" width="70" />
        <el-table-column prop="direction" label="方向" width="100">
          <template #default="{ row }">
            <el-tag :type="dirType(row.direction)" size="small">{{ dirLabel(row.direction) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="confidence" label="置信度" width="90">
          <template #default="{ row }">{{ (row.confidence * 100).toFixed(1) }}%</template>
        </el-table-column>
        <el-table-column prop="userQuery" label="问题" min-width="160" show-overflow-tooltip />
        <el-table-column label="依据" min-width="200">
          <template #default="{ row }">
            <div v-for="r in row.rationale.slice(0, 2)" :key="r" class="rationale-line">{{ r }}</div>
            <span v-if="row.rationale.length > 2" class="more">+{{ row.rationale.length - 2 }} 条</span>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="load"
        style="margin-top:16px"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue"
import { getPredictionHistory } from "../api/index"
import type { PredictionResult } from "../types/index"

const list = ref<PredictionResult[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)

async function load(p = 1) {
  loading.value = true
  page.value = p
  try {
    const res = await getPredictionHistory("USDCNH", p, pageSize)
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

onMounted(() => load())

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("zh-CN")
}

type TagType = "success" | "danger" | "info"

function dirType(d: string): TagType {
  return d === "bullish" ? "success" : d === "bearish" ? "danger" : "info"
}

function dirLabel(d: string) {
  return d === "bullish" ? "看多" : d === "bearish" ? "看空" : "震荡"
}
</script>

<style scoped>
.history-page { }
.page-card { border-radius: 8px; }
.page-title { font-size: 15px; font-weight: 600; color: #303133; }
.rationale-line { font-size: 11px; color: #606266; line-height: 1.5; }
.more { font-size: 11px; color: #909399; }
</style>
