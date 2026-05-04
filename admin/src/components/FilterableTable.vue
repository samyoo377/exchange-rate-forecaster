<template>
  <div class="filterable-table-wrap">
    <div class="ft-toolbar" v-if="showToolbar">
      <slot name="toolbar" />
      <div style="flex:1" />
      <el-button v-if="hasActiveFilters" text type="danger" size="small" @click="clearAllFilters">
        清除所有筛选
      </el-button>
      <el-text type="info" size="small">共 {{ total }} 条</el-text>
    </div>

    <!-- Filter bar -->
    <div v-if="activeFilterCols.length" class="ft-filter-bar">
      <div v-for="col in activeFilterCols" :key="col.prop" class="ft-filter-item">
        <span class="ft-filter-label">{{ col.label || col.prop }}</span>
        <el-select
          v-if="colFilterType(col) === 'enum'"
          v-model="filters[col.prop]"
          size="small"
          placeholder="全部"
          clearable
          class="ft-filter-input"
          @change="debouncedFetch"
          @clear="debouncedFetch"
        >
          <el-option
            v-for="opt in getEnumOptions(col.prop)"
            :key="opt"
            :label="opt"
            :value="opt"
          />
        </el-select>
        <el-input
          v-else-if="colFilterType(col) === 'text'"
          v-model="filters[col.prop]"
          size="small"
          :placeholder="colFilterPlaceholder(col)"
          clearable
          class="ft-filter-input"
          @input="debouncedFetch"
          @clear="debouncedFetch"
          @keyup.enter="fetchData"
        />
      </div>
    </div>

    <el-table
      :data="rows"
      border
      stripe
      size="small"
      v-loading="loading"
      @sort-change="onSortChange"
      style="width:100%"
      :max-height="maxHeight"
      row-key="id"
    >
      <!-- Expand column -->
      <el-table-column type="expand" width="36">
        <template #default="{ row }">
          <div class="expand-content">
            <div v-for="(val, key) in row" :key="String(key)" class="expand-field">
              <span class="expand-key">{{ String(key) }}</span>
              <span class="expand-val">
                <a v-if="isUrl(val)" :href="String(val)" target="_blank" rel="noopener" class="link-val">{{ val }}</a>
                <span v-else-if="isJson(val)">
                  <pre class="expand-json">{{ formatJson(val) }}</pre>
                </span>
                <span v-else>{{ formatCell(val) }}</span>
              </span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column
        v-for="col in resolvedColumns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.label || col.prop"
        :sortable="colSortable(col)"
        :min-width="col.minWidth || computeWidth(col.prop)"
        :width="col.width"
        :fixed="col.fixed"
        :align="col.align"
        show-overflow-tooltip
      >
        <template #default="scope">
          <slot :name="col.prop" v-bind="scope">
            <span v-if="isJson(scope.row[col.prop])">
              <el-popover trigger="click" width="400">
                <template #reference>
                  <el-button link type="primary" size="small">查看JSON</el-button>
                </template>
                <pre style="max-height:300px;overflow:auto;font-size:12px">{{ formatJson(scope.row[col.prop]) }}</pre>
              </el-popover>
            </span>
            <a
              v-else-if="isUrl(scope.row[col.prop])"
              :href="String(scope.row[col.prop])"
              target="_blank"
              rel="noopener"
              class="link-val"
            >{{ scope.row[col.prop] }}</a>
            <span v-else>{{ formatCell(scope.row[col.prop]) }}</span>
          </slot>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total > 0" class="ft-pagination">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="internalPageSize"
        :total="total"
        :page-sizes="pageSizes"
        layout="total, sizes, prev, pager, next"
        small
        @current-change="fetchData"
        @size-change="fetchData"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue"
import { queryTable, getTableSchema, getDistinctValues } from "../api/index"

export interface ColumnDef {
  prop: string
  label?: string
  width?: number
  minWidth?: number
  sortable?: boolean
  filterable?: boolean
  filterType?: "text" | "enum" | "none"
  enumOptions?: string[]
  fixed?: "left" | "right"
  align?: "left" | "center" | "right"
}

const FILTERABLE_TYPES = new Set(["String", "Int", "Float"])
const SORTABLE_TYPES = new Set(["String", "Int", "Float", "DateTime"])
const ENUM_FIELDS = new Set([
  "status", "type", "role", "scope", "direction", "sentiment",
  "source", "category", "requestMethod", "horizon", "taskType",
  "modelVersion", "version",
])

const props = withDefaults(
  defineProps<{
    tableName: string
    columns?: ColumnDef[]
    defaultOrderBy?: Record<string, string>
    initPageSize?: number
    pageSizes?: number[]
    maxHeight?: number | string
    showToolbar?: boolean
  }>(),
  {
    defaultOrderBy: () => ({ createdAt: "desc" }),
    initPageSize: 20,
    pageSizes: () => [10, 20, 50, 100],
    maxHeight: 600,
    showToolbar: true,
  },
)

const rows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const internalPageSize = ref(props.initPageSize)
const loading = ref(false)
const filters = reactive<Record<string, string>>({})
const orderBy = ref<Record<string, string>>({ ...props.defaultOrderBy })
const schemaFields = ref<string[]>([])
const fieldTypes = ref<Record<string, string>>({})
const enumOptionsCache = reactive<Record<string, string[]>>({})

let debounceTimer: ReturnType<typeof setTimeout> | null = null

const resolvedColumns = computed<ColumnDef[]>(() => {
  if (props.columns?.length) return props.columns
  return schemaFields.value.map((f) => ({ prop: f, label: f }))
})

const activeFilterCols = computed(() =>
  resolvedColumns.value.filter((col) => colFilterType(col) !== "none")
)

const hasActiveFilters = computed(() =>
  Object.values(filters).some((v) => v && v.trim()),
)

function colFilterType(col: ColumnDef): "text" | "enum" | "none" {
  if (col.filterable === false || col.filterType === "none") return "none"
  if (col.filterType) return col.filterType
  if (col.prop.startsWith("_")) return "none"
  const type = fieldTypes.value[col.prop]
  if (!type) return "text"
  if (ENUM_FIELDS.has(col.prop) && type === "String") return "enum"
  if (FILTERABLE_TYPES.has(type)) return "text"
  if (type === "Boolean") return "enum"
  return "none"
}

function colSortable(col: ColumnDef): false | "custom" {
  if (col.sortable === false) return false
  if (col.prop.startsWith("_")) return false
  const type = fieldTypes.value[col.prop]
  if (!type) return "custom"
  return SORTABLE_TYPES.has(type) ? "custom" : false
}

function colFilterPlaceholder(col: ColumnDef): string {
  const type = fieldTypes.value[col.prop]
  if (type === "Int" || type === "Float") return "输入数值"
  return "模糊搜索"
}

function getEnumOptions(prop: string): string[] {
  if (enumOptionsCache[prop]?.length) return enumOptionsCache[prop]
  const type = fieldTypes.value[prop]
  if (type === "Boolean") return ["true", "false"]
  return []
}

async function loadEnumValues(prop: string) {
  if (enumOptionsCache[prop]?.length) return
  const type = fieldTypes.value[prop]
  if (type === "Boolean") {
    enumOptionsCache[prop] = ["true", "false"]
    return
  }
  try {
    const values = await getDistinctValues(props.tableName, prop)
    enumOptionsCache[prop] = values.map(String).filter((v) => v && v !== "null")
  } catch {
    enumOptionsCache[prop] = []
  }
}

function debouncedFetch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    page.value = 1
    fetchData()
  }, 400)
}

function clearAllFilters() {
  for (const key of Object.keys(filters)) {
    filters[key] = ""
  }
  page.value = 1
  fetchData()
}

function buildFilters(): Record<string, string> | undefined {
  const result: Record<string, string> = {}
  for (const [field, value] of Object.entries(filters)) {
    if (value?.trim()) result[field] = value.trim()
  }
  return Object.keys(result).length > 0 ? result : undefined
}

async function fetchData() {
  if (!props.tableName) return
  loading.value = true
  try {
    const result = await queryTable(props.tableName, {
      filters: buildFilters(),
      orderBy: orderBy.value,
      take: internalPageSize.value,
      skip: (page.value - 1) * internalPageSize.value,
    })
    rows.value = result.rows
    total.value = result.total
  } finally {
    loading.value = false
  }
}

function onSortChange({ prop, order }: { prop: string; order: string | null }) {
  if (!prop || !order) {
    orderBy.value = { ...props.defaultOrderBy }
  } else {
    orderBy.value = { [prop]: order === "ascending" ? "asc" : "desc" }
  }
  fetchData()
}

function computeWidth(field: string): number {
  if (field === "id") return 80
  if (field.includes("At") || field.includes("Date")) return 170
  if (["payload", "rationale", "summary", "responseBody", "content"].includes(field)) return 200
  if (field === "url" || field === "requestUrl") return 200
  return 140
}

function isUrl(val: any): boolean {
  if (typeof val !== "string") return false
  return /^https?:\/\/\S+/.test(val)
}

function isJson(val: any): boolean {
  if (typeof val === "object" && val !== null) return true
  if (typeof val === "string") {
    try {
      JSON.parse(val)
      return val.startsWith("{") || val.startsWith("[")
    } catch {
      return false
    }
  }
  return false
}

function formatJson(val: any): string {
  if (typeof val === "string") {
    try {
      return JSON.stringify(JSON.parse(val), null, 2)
    } catch {
      return val
    }
  }
  return JSON.stringify(val, null, 2)
}

function formatCell(val: any): string {
  if (val === null || val === undefined) return "-"
  if (typeof val === "boolean") return val ? "是" : "否"
  if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return new Date(val).toLocaleString("zh-CN")
  }
  return String(val)
}

async function loadSchema() {
  try {
    const schema = await getTableSchema(props.tableName)
    if (!props.columns?.length) {
      schemaFields.value = schema.fields
    }
    fieldTypes.value = schema.fieldTypes ?? {}

    for (const col of resolvedColumns.value) {
      if (!(col.prop in filters)) filters[col.prop] = ""
      if (colFilterType(col) === "enum") {
        loadEnumValues(col.prop)
      }
    }
  } catch {
    // ok
  }
}

async function init() {
  await loadSchema()
  for (const col of resolvedColumns.value) {
    if (!(col.prop in filters)) filters[col.prop] = ""
  }
  await fetchData()
}

function refresh() {
  return fetchData()
}

watch(
  () => props.tableName,
  () => {
    schemaFields.value = []
    rows.value = []
    total.value = 0
    page.value = 1
    orderBy.value = { ...props.defaultOrderBy }
    fieldTypes.value = {}
    for (const key of Object.keys(filters)) {
      delete filters[key]
    }
    for (const key of Object.keys(enumOptionsCache)) {
      delete enumOptionsCache[key]
    }
    init()
  },
)

onMounted(init)

defineExpose({ refresh, rows })
</script>

<style scoped>
.ft-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.ft-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: #f5f7fa;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}

.ft-filter-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ft-filter-label {
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
  font-weight: 500;
}

.ft-filter-input {
  width: 130px;
}

.ft-filter-input :deep(.el-input__inner) {
  font-size: 12px;
}

.ft-pagination {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

/* Expand row */
.expand-content {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 4px 24px;
  padding: 8px 16px;
}

.expand-field {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.8;
  min-width: 0;
}

.expand-key {
  color: #909399;
  flex-shrink: 0;
  font-weight: 500;
  min-width: 100px;
  text-align: right;
}

.expand-key::after {
  content: ":";
}

.expand-val {
  color: #303133;
  word-break: break-all;
  min-width: 0;
  flex: 1;
}

.expand-json {
  font-size: 11px;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 4px 8px;
  max-height: 200px;
  overflow: auto;
  margin: 2px 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.link-val {
  color: #409eff;
  text-decoration: none;
  word-break: break-all;
}

.link-val:hover {
  text-decoration: underline;
}
</style>
