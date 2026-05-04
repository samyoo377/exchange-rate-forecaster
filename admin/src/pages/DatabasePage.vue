<template>
  <div class="data-page">
    <h2 class="page-title">数据中心</h2>

    <!-- Table selector toolbar -->
    <div class="toolbar">
      <el-select
        v-model="selectedTables"
        multiple
        collapse-tags
        collapse-tags-tooltip
        placeholder="选择数据表 (可多选)"
        @change="onTablesChange"
        style="width: 400px"
      >
        <el-option v-for="t in tables" :key="t.name" :label="`${t.name} (${t.count})`" :value="t.name" />
      </el-select>

      <!-- Global time filter -->
      <el-date-picker
        v-model="timeRange"
        type="datetimerange"
        range-separator="~"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        size="default"
        value-format="YYYY-MM-DDTHH:mm:ss"
        :shortcuts="timeShortcuts"
        @change="onTimeRangeChange"
        style="width: 380px"
      />

      <el-button :icon="Refresh" @click="refreshAll">刷新</el-button>
    </div>

    <!-- Tab panels for each selected table -->
    <el-tabs v-if="selectedTables.length" v-model="activeTab" type="border-card" @tab-change="onTabChange">
      <el-tab-pane v-for="table in selectedTables" :key="table" :name="table" :label="table" lazy>
        <!-- Chart section -->
        <div v-if="isKlineTable(table) || chartableFields[table]?.length" class="chart-section">
          <div class="chart-toolbar">
            <!-- K-line mode toggle for NormalizedMarketSnapshot -->
            <template v-if="isKlineTable(table)">
              <el-radio-group v-model="chartMode[table]" size="small" @change="drawChart(table)">
                <el-radio-button value="kline">K线图</el-radio-button>
                <el-radio-button value="field">字段图</el-radio-button>
              </el-radio-group>
              <el-radio-group v-if="chartMode[table] === 'kline'" v-model="klineInterval[table]" size="small" @change="drawChart(table)">
                <el-radio-button value="1h">小时</el-radio-button>
                <el-radio-button value="4h">4小时</el-radio-button>
                <el-radio-button value="1d">日线</el-radio-button>
              </el-radio-group>
            </template>

            <template v-if="!isKlineTable(table) || chartMode[table] === 'field'">
              <el-select v-model="chartField[table]" placeholder="选择图表字段" size="small" style="width: 180px" @change="drawChart(table)">
                <el-option v-for="f in chartableFields[table]" :key="f" :label="f" :value="f" />
              </el-select>
              <el-radio-group v-model="chartType[table]" size="small" @change="drawChart(table)">
                <el-radio-button value="line">折线图</el-radio-button>
                <el-radio-button value="bar">柱状图</el-radio-button>
              </el-radio-group>
            </template>

            <!-- Axis range inputs -->
            <div class="axis-range-inputs">
              <span class="axis-label">X轴:</span>
              <el-input-number v-model="xStart[table]" size="small" :controls="false" :min="0" :max="100" placeholder="起始%" style="width: 70px" @change="applyXRange(table)" />
              <span>~</span>
              <el-input-number v-model="xEnd[table]" size="small" :controls="false" :min="0" :max="100" placeholder="结束%" style="width: 70px" @change="applyXRange(table)" />
              <span class="axis-label" style="margin-left: 8px">Y轴:</span>
              <el-input-number v-model="yMin[table]" size="small" :controls="false" placeholder="最小" style="width: 90px" @change="applyYRange(table)" />
              <span>~</span>
              <el-input-number v-model="yMax[table]" size="small" :controls="false" placeholder="最大" style="width: 90px" @change="applyYRange(table)" />
              <el-button size="small" text @click="resetAxisRange(table)">重置</el-button>
            </div>
          </div>
          <div :ref="(el) => setChartRef(table, el as HTMLElement)" class="chart-container" />
        </div>

        <!-- FilterableTable -->
        <FilterableTable
          :ref="(el) => setTableRef(table, el)"
          :tableName="table"
          :key="table + timeRangeKey"
          :maxHeight="500"
          :initPageSize="20"
          :pageSizes="[10, 20, 50, 100, 200]"
        />
      </el-tab-pane>
    </el-tabs>

    <el-empty v-else description="请选择一个或多个数据表" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick } from "vue"
import { useRoute } from "vue-router"
import { Refresh } from "@element-plus/icons-vue"
import { getTableList, queryTable, getTableSchema, type TableInfo } from "../api/index"
import FilterableTable from "../components/FilterableTable.vue"

const STORAGE_KEY = "admin_data_center_tables"
const KLINE_TABLE = "NormalizedMarketSnapshot"
const route = useRoute()
const tables = ref<TableInfo[]>([])
const selectedTables = ref<string[]>([])
const activeTab = ref("")
const timeRange = ref<[string, string] | null>(null)
const timeRangeKey = ref(0)
const notShowTables = ["ChatSession", "ChatMessage"]

const chartField = reactive<Record<string, string>>({})
const chartType = reactive<Record<string, string>>({})
const chartMode = reactive<Record<string, string>>({})
const klineInterval = reactive<Record<string, string>>({})
const chartableFields = reactive<Record<string, string[]>>({})
const chartRefs = reactive<Record<string, HTMLElement | null>>({})
const tableRefs = reactive<Record<string, any>>({})
const yMin = reactive<Record<string, number | undefined>>({})
const yMax = reactive<Record<string, number | undefined>>({})
const xStart = reactive<Record<string, number | undefined>>({})
const xEnd = reactive<Record<string, number | undefined>>({})
let chartInstances: Record<string, any> = {}
let suppressDataZoomSync = false

const timeShortcuts = [
  { text: "最近1小时", value: () => { const e = new Date(); const s = new Date(e.getTime() - 3600000); return [s, e] } },
  { text: "今天", value: () => { const e = new Date(); const s = new Date(); s.setHours(0,0,0,0); return [s, e] } },
  { text: "最近7天", value: () => { const e = new Date(); const s = new Date(e.getTime() - 7*86400000); return [s, e] } },
  { text: "最近30天", value: () => { const e = new Date(); const s = new Date(e.getTime() - 30*86400000); return [s, e] } },
]

function isKlineTable(table: string) {
  return table === KLINE_TABLE
}

function setChartRef(table: string, el: HTMLElement | null) {
  chartRefs[table] = el
}

function setTableRef(table: string, el: any) {
  tableRefs[table] = el
}

function saveSelection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedTables.value))
}

function loadSelection() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved) as string[]
  } catch { /* ok */ }
  return []
}

function resetAxisRange(table: string) {
  yMin[table] = undefined
  yMax[table] = undefined
  xStart[table] = undefined
  xEnd[table] = undefined
  const instance = chartInstances[table]
  if (instance) {
    suppressDataZoomSync = true
    instance.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, start: 0, end: 100 })
    instance.dispatchAction({ type: "dataZoom", dataZoomIndex: 1, start: 0, end: 100 })
    suppressDataZoomSync = false
  }
  drawChart(table)
}

function applyXRange(table: string) {
  const instance = chartInstances[table]
  if (!instance) return
  const start = xStart[table] ?? 0
  const end = xEnd[table] ?? 100
  suppressDataZoomSync = true
  instance.dispatchAction({ type: "dataZoom", dataZoomIndex: 0, start, end })
  instance.dispatchAction({ type: "dataZoom", dataZoomIndex: 1, start, end })
  suppressDataZoomSync = false
}

function applyYRange(table: string) {
  drawChart(table)
}

function registerDataZoomHandler(table: string, instance: any) {
  instance.off("datazoom")
  instance.on("datazoom", (params: any) => {
    if (suppressDataZoomSync) return

    const option = instance.getOption()
    const dataZooms = option.dataZoom || []

    for (const dz of dataZooms) {
      if (dz.xAxisIndex != null || (dz.orient !== "vertical" && dz.yAxisIndex == null)) {
        if (dz.start != null) xStart[table] = Math.round(dz.start)
        if (dz.end != null) xEnd[table] = Math.round(dz.end)
      }
    }

    const yAxis = option.yAxis?.[0] ?? option.yAxis
    if (yAxis) {
      const model = instance.getModel()
      try {
        const yAxisModel = model.getComponent("yAxis", 0)
        const extent = yAxisModel?.axis?.scale?.getExtent?.()
        if (extent) {
          yMin[table] = parseFloat(extent[0].toFixed(6))
          yMax[table] = parseFloat(extent[1].toFixed(6))
        }
      } catch { /* ok */ }
    }
  })
}

async function onTablesChange() {
  saveSelection()
  if (selectedTables.value.length && !selectedTables.value.includes(activeTab.value)) {
    activeTab.value = selectedTables.value[0]
  }
  for (const table of selectedTables.value) {
    if (!chartableFields[table]) {
      await loadChartFields(table)
    }
    if (isKlineTable(table) && !chartMode[table]) {
      chartMode[table] = "kline"
      klineInterval[table] = "1d"
    }
  }
}

function onTabChange(tab: string) {
  activeTab.value = tab
  nextTick(() => drawChart(tab))
}

function onTimeRangeChange() {
  timeRangeKey.value++
}

async function loadChartFields(table: string) {
  try {
    const schema = await getTableSchema(table)
    const numericTypes = new Set(["Float", "Int"])
    const ft = schema.fieldTypes ?? {}
    chartableFields[table] = schema.fields.filter((f) => numericTypes.has(ft[f]))
    if (chartableFields[table].length && !chartField[table]) {
      chartField[table] = chartableFields[table][0]
    }
    if (!chartType[table]) chartType[table] = "line"
  } catch {
    chartableFields[table] = []
  }
}

function aggregateKline(rows: any[], interval: string) {
  function bucketKey(dateStr: string): string {
    const d = new Date(dateStr)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    const h = d.getHours()
    if (interval === "1d") return `${y}-${m}-${day}`
    if (interval === "4h") {
      const bucket = Math.floor(h / 4) * 4
      return `${y}-${m}-${day} ${String(bucket).padStart(2, "0")}:00`
    }
    return `${y}-${m}-${day} ${String(h).padStart(2, "0")}:00`
  }

  const buckets = new Map<string, any[]>()
  for (const r of rows) {
    const key = bucketKey(r.snapshotDate)
    const arr = buckets.get(key)
    if (arr) arr.push(r)
    else buckets.set(key, [r])
  }

  const result: { date: string; open: number; close: number; low: number; high: number }[] = []
  for (const [key, group] of buckets) {
    result.push({
      date: key,
      open: group[0].open,
      close: group[group.length - 1].close,
      high: Math.max(...group.map((g: any) => g.high)),
      low: Math.min(...group.map((g: any) => g.low)),
    })
  }
  return result
}

async function drawChart(table: string) {
  if (!chartRefs[table]) return

  const isKline = isKlineTable(table) && chartMode[table] === "kline"
  const field = chartField[table]
  if (!isKline && !field) return

  try {
    const echarts = await import("echarts")
    let instance = chartInstances[table]
    if (!instance) {
      instance = echarts.init(chartRefs[table]!)
      chartInstances[table] = instance
    }

    if (isKline) {
      const result = await queryTable(table, {
        orderBy: { snapshotDate: "asc" },
        take: 2000,
      })
      const interval = klineInterval[table] || "1d"
      const candles = aggregateKline(result.rows, interval)

      const dates = candles.map((c) => c.date)
      const ohlcData = candles.map((c) => [c.open, c.close, c.low, c.high])

      const hasYRange = yMin[table] != null || yMax[table] != null
      const xS = xStart[table] ?? 50
      const xE = xEnd[table] ?? 100

      instance.setOption({
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross" },
        },
        xAxis: {
          type: "category",
          data: dates,
          axisLabel: { fontSize: 10, rotate: 30 },
        },
        yAxis: {
          type: "value",
          scale: true,
          min: hasYRange ? yMin[table] : undefined,
          max: hasYRange ? yMax[table] : undefined,
          axisLabel: { fontSize: 10, formatter: (v: number) => v.toFixed(4) },
        },
        dataZoom: [
          { type: "inside", xAxisIndex: 0, start: xS, end: xE },
          { type: "slider", xAxisIndex: 0, start: xS, end: xE, height: 20, bottom: 4 },
          { type: "inside", yAxisIndex: 0 },
          { type: "slider", yAxisIndex: 0, width: 20, right: 4 },
        ],
        series: [{
          name: "K线",
          type: "candlestick",
          data: ohlcData,
          itemStyle: {
            color: "#ef232a",
            color0: "#14b143",
            borderColor: "#ef232a",
            borderColor0: "#14b143",
          },
        }],
        grid: { left: 70, right: 40, top: 20, bottom: 60 },
      }, true)
      registerDataZoomHandler(table, instance)
    } else {
      const result = await queryTable(table, {
        orderBy: { createdAt: "asc" },
        take: 200,
      })

      const xData = result.rows.map((r: any) => {
        const t = r.createdAt || r.snapshotDate || r.startedAt || r.fetchedAt
        return t ? new Date(t).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }) : ""
      })
      const yData = result.rows.map((r: any) => r[field] ?? 0)

      const hasYRange = yMin[table] != null || yMax[table] != null
      const xS = xStart[table] ?? 0
      const xE = xEnd[table] ?? 100

      instance.setOption({
        tooltip: { trigger: "axis" },
        xAxis: {
          type: "category",
          data: xData,
          axisLabel: { fontSize: 10, rotate: 30 },
        },
        yAxis: {
          type: "value",
          scale: true,
          min: hasYRange ? yMin[table] : undefined,
          max: hasYRange ? yMax[table] : undefined,
          axisLabel: { fontSize: 10 },
        },
        dataZoom: [
          { type: "inside", xAxisIndex: 0, start: xS, end: xE },
          { type: "slider", xAxisIndex: 0, start: xS, end: xE, height: 20, bottom: 4 },
          { type: "inside", yAxisIndex: 0 },
          { type: "slider", yAxisIndex: 0, width: 20, right: 4 },
        ],
        series: [{
          name: field,
          type: chartType[table] === "bar" ? "bar" : "line",
          data: yData,
          smooth: true,
          areaStyle: chartType[table] !== "bar" ? { opacity: 0.1 } : undefined,
        }],
        grid: { left: 60, right: 40, top: 20, bottom: 60 },
      }, true)
      registerDataZoomHandler(table, instance)
    }
    instance.resize()
  } catch {
    // echarts not available or data error
  }
}

async function refreshAll() {
  for (const table of selectedTables.value) {
    tableRefs[table]?.refresh?.()
    drawChart(table)
  }
}

async function loadTables() {
  const data = await getTableList()
  tables.value = data.filter((t) => !notShowTables.includes(t.name))

  const q = route.query.table as string
  const saved = loadSelection()

  if (q && tables.value.some((t) => t.name === q)) {
    selectedTables.value = [q]
  } else if (saved.length) {
    selectedTables.value = saved.filter((s) => tables.value.some((t) => t.name === s))
  }

  if (selectedTables.value.length) {
    activeTab.value = selectedTables.value[0]
    for (const table of selectedTables.value) {
      await loadChartFields(table)
      if (isKlineTable(table) && !chartMode[table]) {
        chartMode[table] = "kline"
        klineInterval[table] = "1d"
      }
    }
    nextTick(() => drawChart(activeTab.value))
  }
}

function handleResize() {
  for (const instance of Object.values(chartInstances)) {
    instance?.resize?.()
  }
}

onMounted(() => {
  loadTables()
  window.addEventListener("resize", handleResize)
})

onUnmounted(() => {
  window.removeEventListener("resize", handleResize)
  for (const instance of Object.values(chartInstances)) {
    instance?.dispose?.()
  }
  chartInstances = {}
})
</script>

<style scoped>
.page-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #303133;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.chart-section {
  margin-bottom: 14px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px;
  background: #fafbfc;
}

.chart-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.axis-range-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.axis-label {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}

.chart-container {
  width: 100%;
  height: 320px;
}
</style>
