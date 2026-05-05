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
        <el-tag :type="typeColor(row.type)" size="small">{{ typeLabel(row.type) }}</el-tag>
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
        <template v-if="isTokenExpired(row)">
          <el-text type="warning" size="small">
            <el-icon style="vertical-align: middle"><WarningFilled /></el-icon>
            Token 已过期
          </el-text>
        </template>
        <el-text type="danger" size="small" v-else-if="row.lastError">{{ row.lastError }}</el-text>
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

    <!-- Add/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑新闻源' : '添加新闻源'" width="640px" top="5vh">
      <el-form :model="form" label-width="100px" @submit.prevent="saveSource">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="唯一标识，如 reuters_fx" />
        </el-form-item>

        <el-form-item label="类型" required>
          <el-radio-group v-model="form.type" @change="onTypeChange">
            <el-radio value="rss">RSS</el-radio>
            <el-radio value="json-api">JSON API</el-radio>
            <el-radio value="twitter">Twitter</el-radio>
            <el-radio value="headless-browser">无头浏览器</el-radio>
            <el-radio value="curl">CURL</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="URL" required v-if="form.type !== 'curl' || !parseConfig.curlCommand">
          <el-input v-model="form.url" placeholder="RSS / API / 页面地址" />
        </el-form-item>

        <!-- Headless Browser Config -->
        <template v-if="form.type === 'headless-browser'">
          <el-divider content-position="left">页面解析配置</el-divider>
          <el-form-item label="条目选择器" required>
            <el-input v-model="parseConfig.itemSelector" placeholder="如 .news-list .item" />
          </el-form-item>
          <el-form-item label="标题选择器" required>
            <el-input v-model="parseConfig.titleSelector" placeholder="如 h3, .title" />
          </el-form-item>
          <el-form-item label="链接选择器" required>
            <el-input v-model="parseConfig.urlSelector" placeholder="如 a (取 href 属性)" />
          </el-form-item>
          <el-form-item label="摘要选择器">
            <el-input v-model="parseConfig.summarySelector" placeholder="可选，如 .summary, p" />
          </el-form-item>
          <el-form-item label="等待选择器">
            <el-input v-model="parseConfig.waitSelector" placeholder="可选，页面加载完成标志" />
          </el-form-item>
          <el-divider content-position="left">认证配置（可选）</el-divider>
          <el-form-item label="Token">
            <el-input v-model="parseConfig.token" placeholder="如 Bearer xxx" type="password" show-password />
          </el-form-item>
          <el-form-item label="Header名称">
            <el-input v-model="parseConfig.tokenHeader" placeholder="默认 Authorization" />
          </el-form-item>
        </template>

        <!-- CURL Config -->
        <template v-if="form.type === 'curl'">
          <el-divider content-position="left">CURL 配置</el-divider>
          <el-form-item label="Curl 命令">
            <el-input
              v-model="parseConfig.curlCommand"
              type="textarea"
              :rows="5"
              placeholder="粘贴完整 curl 命令（从浏览器 DevTools 复制），URL 将自动提取"
            />
            <div class="form-hint" v-if="parseConfig.curlCommand">
              系统将自动解析 curl 命令中的 URL、Headers、Method 等参数
            </div>
          </el-form-item>

          <el-form-item label="解析方式">
            <el-radio-group v-model="parseConfig.parseType">
              <el-radio value="json-api">JSON</el-radio>
              <el-radio value="rss">RSS/XML</el-radio>
              <el-radio value="html">HTML</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="JSON 路径" v-if="parseConfig.parseType === 'json-api' || !parseConfig.parseType">
            <el-input v-model="parseConfig.jsonPath" placeholder="如 data.items（留空则自动检测）" />
          </el-form-item>

          <!-- HTML selectors for curl+html -->
          <template v-if="parseConfig.parseType === 'html'">
            <el-form-item label="条目选择器" required>
              <el-input v-model="parseConfig.itemSelector" placeholder="如 .news-list .item" />
            </el-form-item>
            <el-form-item label="标题选择器" required>
              <el-input v-model="parseConfig.titleSelector" placeholder="如 h3, .title" />
            </el-form-item>
            <el-form-item label="链接选择器" required>
              <el-input v-model="parseConfig.urlSelector" placeholder="如 a (取 href 属性)" />
            </el-form-item>
            <el-form-item label="摘要选择器">
              <el-input v-model="parseConfig.summarySelector" placeholder="可选" />
            </el-form-item>
          </template>

          <el-divider content-position="left">Token 有效期管理</el-divider>
          <el-form-item label="Token过期时间">
            <el-date-picker
              v-model="parseConfig.tokenExpiresAt"
              type="datetime"
              placeholder="选择过期时间（可选）"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DDTHH:mm:ss.000Z"
              style="width: 100%"
            />
          </el-form-item>
          <el-alert
            v-if="parseConfig.tokenExpiresAt && new Date(parseConfig.tokenExpiresAt).getTime() < Date.now()"
            type="warning"
            title="Token 已过期，请更新 curl 命令中的认证信息"
            :closable="false"
            show-icon
            style="margin-bottom: 12px"
          />
          <el-alert
            v-else-if="parseConfig.tokenExpiresAt && new Date(parseConfig.tokenExpiresAt).getTime() < Date.now() + 24 * 3600_000"
            type="info"
            title="Token 将在 24 小时内过期"
            :closable="false"
            show-icon
            style="margin-bottom: 12px"
          />
        </template>

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

        <!-- Advanced parseConfig JSON editor -->
        <el-collapse v-if="form.type === 'headless-browser' || form.type === 'curl'">
          <el-collapse-item title="高级配置（JSON）" name="advanced">
            <el-input
              v-model="rawParseConfigJson"
              type="textarea"
              :rows="6"
              placeholder="parseConfig JSON（修改后会覆盖上方表单值）"
              @blur="onRawJsonBlur"
            />
            <div class="form-hint error" v-if="jsonError">{{ jsonError }}</div>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSource" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from "vue"
import { ElMessage } from "element-plus"
import { WarningFilled } from "@element-plus/icons-vue"
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
  { prop: "url", label: "URL", minWidth: 220 },
  { prop: "type", label: "类型", width: 110 },
  { prop: "category", label: "分类", width: 100 },
  { prop: "enabled", label: "启用", width: 80, align: "center" },
  { prop: "lastFetchedAt", label: "最近抓取", width: 170 },
  { prop: "lastError", label: "状态", width: 140 },
  { prop: "_actions", label: "操作", width: 210, filterable: false, sortable: false, fixed: "right" },
]

const typeLabels: Record<string, string> = {
  rss: "RSS",
  "json-api": "JSON API",
  twitter: "Twitter",
  "headless-browser": "无头浏览器",
  curl: "CURL",
}
function typeLabel(type: string) { return typeLabels[type] ?? type }
function typeColor(type: string) {
  if (type === "rss") return "success"
  if (type === "twitter") return "warning"
  if (type === "headless-browser") return "danger"
  if (type === "curl") return ""
  return ""
}

function isTokenExpired(row: any): boolean {
  if (!row.parseConfig) return false
  try {
    const cfg = JSON.parse(row.parseConfig)
    if (!cfg.tokenExpiresAt) return false
    return new Date(cfg.tokenExpiresAt).getTime() < Date.now()
  } catch { return false }
}

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const form = ref({
  name: "", url: "", type: "rss", category: "forex", enabled: true,
})
const parseConfig = ref<Record<string, any>>({})
const rawParseConfigJson = ref("")
const jsonError = ref("")

function onTypeChange() {
  parseConfig.value = {}
  if (form.value.type === "curl") {
    parseConfig.value.parseType = "json-api"
  }
}

watch(parseConfig, (val) => {
  const clean = Object.fromEntries(Object.entries(val).filter(([_, v]) => v !== "" && v !== undefined && v !== null))
  rawParseConfigJson.value = Object.keys(clean).length ? JSON.stringify(clean, null, 2) : ""
}, { deep: true })

function onRawJsonBlur() {
  jsonError.value = ""
  if (!rawParseConfigJson.value.trim()) {
    parseConfig.value = {}
    return
  }
  try {
    parseConfig.value = JSON.parse(rawParseConfigJson.value)
  } catch (e: any) {
    jsonError.value = "JSON 格式错误: " + e.message
  }
}

function showDialog(row?: any) {
  jsonError.value = ""
  if (row) {
    editingId.value = row.id
    form.value = { name: row.name, url: row.url, type: row.type, category: row.category, enabled: row.enabled }
    try {
      parseConfig.value = row.parseConfig ? JSON.parse(row.parseConfig) : {}
    } catch {
      parseConfig.value = {}
    }
  } else {
    editingId.value = null
    form.value = { name: "", url: "", type: "rss", category: "forex", enabled: true }
    parseConfig.value = {}
  }
  dialogVisible.value = true
}

function buildSaveData() {
  const data: Record<string, any> = { ...form.value }
  if (form.value.type === "headless-browser" || form.value.type === "curl") {
    const clean = Object.fromEntries(
      Object.entries(parseConfig.value).filter(([_, v]) => v !== "" && v !== undefined && v !== null),
    )
    data.parseConfig = Object.keys(clean).length ? JSON.stringify(clean) : null
  } else {
    data.parseConfig = null
  }
  return data
}

async function saveSource() {
  saving.value = true
  try {
    const data = buildSaveData()
    if (editingId.value) {
      await updateNewsSource(editingId.value, data)
      ElMessage.success("更新成功")
    } else {
      await createNewsSource(data)
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
.form-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.form-hint.error { color: var(--el-color-danger); }
:deep(.el-divider__text) { font-size: 13px; color: var(--el-text-color-secondary); }
:deep(.el-collapse) { border: none; margin-top: 8px; }
:deep(.el-collapse-item__header) { font-size: 13px; color: var(--el-text-color-secondary); height: 36px; }
</style>
