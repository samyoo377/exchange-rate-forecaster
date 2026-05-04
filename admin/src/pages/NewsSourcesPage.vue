<template>
  <div class="page">
    <div class="page-header">
      <h2>新闻源管理</h2>
      <el-button type="primary" @click="showDialog()">添加新闻源</el-button>
    </div>

    <FilterableTable
      ref="tableRef"
      tableName="NewsSource"
      :columns="columns"
      :defaultOrderBy="{ createdAt: 'asc' }"
      :initPageSize="20"
    >
      <template #type="{ row }">
        <el-tag :type="typeColor(row.type)" size="small">{{ row.type }}</el-tag>
      </template>
      <template #category="{ row }">
        <el-tag type="info" size="small">{{ row.category }}</el-tag>
      </template>
      <template #enabled="{ row }">
        <el-switch v-model="row.enabled" @change="toggleEnabled(row)" size="small" />
      </template>
      <template #lastFetchedAt="{ row }">
        {{ row.lastFetchedAt ? new Date(row.lastFetchedAt).toLocaleString("zh-CN") : '-' }}
      </template>
      <template #lastError="{ row }">
        <el-text type="danger" size="small" v-if="row.lastError">{{ row.lastError }}</el-text>
        <el-text type="success" size="small" v-else-if="row.lastFetchedAt">正常</el-text>
        <span v-else>-</span>
      </template>
      <template #_actions="{ row }">
        <el-button size="small" @click="testSource(row)" :loading="testingIds.has(row.id)">测试</el-button>
        <el-button size="small" @click="showDialog(row)">编辑</el-button>
        <el-popconfirm title="确定删除？" @confirm="deleteSource(row)">
          <template #reference>
            <el-button size="small" type="danger">删除</el-button>
          </template>
        </el-popconfirm>
      </template>
    </FilterableTable>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑新闻源' : '添加新闻源'" width="500px">
      <el-form :model="form" label-width="80px" @submit.prevent="saveSource">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="唯一标识，如 reuters_fx" />
        </el-form-item>
        <el-form-item label="URL">
          <el-input v-model="form.url" placeholder="RSS 或 API 地址" />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio value="rss">RSS</el-radio>
            <el-radio value="json-api">JSON API</el-radio>
            <el-radio value="twitter">Twitter</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category" placeholder="选择分类" allow-create filterable>
            <el-option label="forex" value="forex" />
            <el-option label="finance" value="finance" />
            <el-option label="economy" value="economy" />
            <el-option label="macro" value="macro" />
            <el-option label="social" value="social" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSource" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue"
import { ElMessage } from "element-plus"
import {
  createNewsSource, updateNewsSource,
  deleteNewsSource as apiDeleteSource, testNewsSource,
} from "../api/index"
import FilterableTable from "../components/FilterableTable.vue"
import type { ColumnDef } from "../components/FilterableTable.vue"

const tableRef = ref<InstanceType<typeof FilterableTable> | null>(null)
const testingIds = reactive(new Set<string>())

const columns: ColumnDef[] = [
  { prop: "name", label: "名称", width: 160 },
  { prop: "url", label: "URL", minWidth: 250 },
  { prop: "type", label: "类型", width: 100 },
  { prop: "category", label: "分类", width: 100 },
  { prop: "enabled", label: "启用", width: 80, align: "center" },
  { prop: "lastFetchedAt", label: "最近抓取", width: 170 },
  { prop: "lastError", label: "错误", width: 120 },
  { prop: "_actions", label: "操作", width: 210, filterable: false, sortable: false, fixed: "right" },
]

function typeColor(type: string) {
  if (type === "rss") return "success"
  if (type === "twitter") return "warning"
  return ""
}

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const form = ref({ name: "", url: "", type: "rss", category: "forex", enabled: true })

function showDialog(row?: any) {
  if (row) {
    editingId.value = row.id
    form.value = { name: row.name, url: row.url, type: row.type, category: row.category, enabled: row.enabled }
  } else {
    editingId.value = null
    form.value = { name: "", url: "", type: "rss", category: "forex", enabled: true }
  }
  dialogVisible.value = true
}

async function saveSource() {
  saving.value = true
  try {
    if (editingId.value) {
      await updateNewsSource(editingId.value, form.value)
      ElMessage.success("更新成功")
    } else {
      await createNewsSource(form.value)
      ElMessage.success("添加成功")
    }
    dialogVisible.value = false
    tableRef.value?.refresh()
  } catch (e: any) {
    ElMessage.error(e.message || "保存失败")
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(row: any) {
  try {
    await updateNewsSource(row.id, { enabled: row.enabled })
  } catch {
    row.enabled = !row.enabled
    ElMessage.error("切换失败")
  }
}

async function deleteSource(row: any) {
  try {
    await apiDeleteSource(row.id)
    ElMessage.success("已删除")
    tableRef.value?.refresh()
  } catch {
    ElMessage.error("删除失败")
  }
}

async function testSource(row: any) {
  testingIds.add(row.id)
  try {
    const result = await testNewsSource(row.id)
    ElMessage.success(`测试成功，获取到 ${result.count} 条数据`)
    tableRef.value?.refresh()
  } catch (e: any) {
    ElMessage.error(`测试失败: ${e.message}`)
  } finally {
    testingIds.delete(row.id)
  }
}
</script>

<style scoped>
.page { max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; }
</style>
