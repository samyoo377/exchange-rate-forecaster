<template>
  <div class="task-page">
    <el-card shadow="never" class="page-card">
      <template #header>
        <el-space>
          <span class="page-title">任务运行日志</span>
          <el-select v-model="filterType" size="small" clearable placeholder="全部类型" style="width:130px">
            <el-option value="data_refresh" label="数据刷新" />
            <el-option value="file_import" label="文件导入" />
          </el-select>
          <el-button size="small" @click="load(1)">查询</el-button>
        </el-space>
      </template>

      <el-table :data="list" v-loading="loading" stripe size="small">
        <el-table-column prop="createdAt" label="时间" width="170">
          <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="taskType" label="任务类型" width="110" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="startedAt" label="开始时间" width="170">
          <template #default="{ row }">{{ fmtDate(row.startedAt) }}</template>
        </el-table-column>
        <el-table-column prop="finishedAt" label="结束时间" width="170">
          <template #default="{ row }">{{ row.finishedAt ? fmtDate(row.finishedAt) : '—' }}</template>
        </el-table-column>
        <el-table-column prop="errorMessage" label="错误信息" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span :style="{ color: row.errorMessage ? '#f56c6c' : '#909399' }">{{ row.errorMessage ?? '—' }}</span>
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
import { getTaskHistory } from "../api/index"
import type { TaskLog } from "../types/index"

const list = ref<TaskLog[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const filterType = ref("")

async function load(p = 1) {
  loading.value = true
  page.value = p
  try {
    const res = await getTaskHistory(filterType.value || undefined, p, pageSize)
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

type TagType = "success" | "danger" | "warning" | "info"

function statusType(s: string): TagType {
  return s === "success" ? "success" : s === "failed" ? "danger" : "warning"
}

function statusLabel(s: string) {
  return s === "success" ? "成功" : s === "failed" ? "失败" : "运行中"
}
</script>

<style scoped>
.page-card { border-radius: 8px; }
.page-title { font-size: 15px; font-weight: 600; color: #303133; }
</style>
