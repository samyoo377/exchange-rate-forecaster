<template>
  <div class="review">
    <h2 class="page-title">回顾</h2>

    <el-card shadow="hover" class="review-card">
      <template #header>
        <div class="card-header">
          <span>预测历史记录</span>
          <el-select v-model="limit" size="small" style="width: 100px" @change="loadPredictions">
            <el-option :value="10" label="近10条" />
            <el-option :value="30" label="近30条" />
            <el-option :value="50" label="近50条" />
          </el-select>
        </div>
      </template>

      <el-table :data="predictions" stripe style="width: 100%" v-loading="loading" empty-text="暂无预测记录">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="方向" width="100">
          <template #default="{ row }">
            <el-tag :type="dirType(row.direction)" size="small" effect="dark">
              {{ dirLabel(row.direction) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="置信度" width="120">
          <template #default="{ row }">
            <el-progress :percentage="Math.round(row.confidence * 100)" :stroke-width="6" :show-text="true"
              :color="confColor(row.confidence)" />
          </template>
        </el-table-column>
        <el-table-column label="周期" width="100" prop="horizon" />
        <el-table-column label="依据摘要">
          <template #default="{ row }">
            <span class="rationale-text">{{ row.rationale?.slice(0, 80) }}{{ row.rationale?.length > 80 ? '...' : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="showDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="detailVisible" title="预测详情" width="640px">
      <template v-if="selectedPred">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="方向">
            <el-tag :type="dirType(selectedPred.direction)" effect="dark">{{ dirLabel(selectedPred.direction) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="置信度">{{ Math.round(selectedPred.confidence * 100) }}%</el-descriptions-item>
          <el-descriptions-item label="周期">{{ selectedPred.horizon }}</el-descriptions-item>
          <el-descriptions-item label="模型">{{ selectedPred.modelVersion }}</el-descriptions-item>
          <el-descriptions-item label="时间" :span="2">{{ formatTime(selectedPred.createdAt) }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="selectedPred.rationale" class="detail-block">
          <div class="detail-label">分析依据</div>
          <div class="detail-text">{{ selectedPred.rationale }}</div>
        </div>
        <div v-if="selectedPred.riskNotes" class="detail-block">
          <div class="detail-label">风险提示</div>
          <div class="detail-text">{{ selectedPred.riskNotes }}</div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue"
import { getPredictionsTimeline, getPredictionDetail } from "../api/index"

const predictions = ref<any[]>([])
const loading = ref(false)
const limit = ref(30)
const detailVisible = ref(false)
const selectedPred = ref<any>(null)

function dirType(d: string) { return d === "bullish" ? "success" : d === "bearish" ? "danger" : "info" }
function dirLabel(d: string) { return d === "bullish" ? "看多" : d === "bearish" ? "看空" : "震荡" }
function confColor(c: number) { return c >= 0.7 ? "#67c23a" : c >= 0.4 ? "#e6a23c" : "#909399" }

function formatTime(t: string | null) {
  if (!t) return "-"
  return new Date(t).toLocaleString("zh-CN")
}

async function loadPredictions() {
  loading.value = true
  try {
    predictions.value = await getPredictionsTimeline("USDCNH", limit.value) ?? []
  } catch { /* ok */ }
  finally { loading.value = false }
}

async function showDetail(row: any) {
  try {
    const detail = await getPredictionDetail(row.id)
    selectedPred.value = detail
    detailVisible.value = true
  } catch { /* ok */ }
}

onMounted(loadPredictions)
</script>

<style scoped>
.review { max-width: 1200px; }
.page-title { font-size: 20px; font-weight: 700; margin-bottom: 20px; color: #303133; }

.review-card { border-radius: 10px; }

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.rationale-text {
  font-size: 12px;
  color: #606266;
  line-height: 1.4;
}

.detail-block { margin-top: 14px; }
.detail-label { font-size: 13px; font-weight: 600; color: #303133; margin-bottom: 6px; }
.detail-text {
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  white-space: pre-wrap;
}
</style>
