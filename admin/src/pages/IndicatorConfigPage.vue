<template>
  <div class="page">
    <div class="page-header">
      <h2>指标公式配置</h2>
      <div class="flow-diagram">
        <span class="flow-step">OHLC 数据</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step active">指标计算器</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">信号判定</span>
        <span class="flow-arrow">→</span>
        <span class="flow-step">综合预测</span>
      </div>
    </div>

    <!-- ═══ Section 1: OHLC Data Preview ═══ -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-header">
          <span class="section-title">行情数据预览</span>
          <el-checkbox-group v-model="visibleFields" size="small" class="field-checks">
            <el-checkbox v-for="f in ohlcFields" :key="f.value" :value="f.value">
              <span :style="{ color: f.color }">{{ f.label }}</span>
            </el-checkbox>
          </el-checkbox-group>
        </div>
      </template>
      <div ref="ohlcChartRef" class="chart-box" v-loading="ohlcLoading" />
    </el-card>

    <!-- ═══ Section 2: Formula Builder ═══ -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <span class="section-title">公式构建 & 预览</span>
      </template>

      <el-row :gutter="16">
        <!-- Left: Formula Input -->
        <el-col :span="12">
          <div class="builder-panel">
            <!-- Quick-insert: data fields -->
            <div class="insert-group">
              <div class="insert-label">数据字段</div>
              <div class="chip-row">
                <el-button v-for="f in ohlcFields" :key="f.value"
                  size="small" plain @click="insertToFormula(f.value)"
                  :style="{ borderColor: f.color, color: f.color }">
                  {{ f.value }}
                </el-button>
                <el-button size="small" plain @click="insertToFormula('period')">period</el-button>
                <el-button size="small" plain @click="insertToFormula('n')">n</el-button>
              </div>
            </div>

            <!-- Quick-insert: series functions -->
            <div class="insert-group">
              <div class="insert-label">序列函数</div>
              <div class="chip-row">
                <el-button v-for="f in seriesFns" :key="f.label"
                  size="small" type="primary" plain @click="insertToFormula(f.template)">
                  {{ f.label }}
                </el-button>
              </div>
            </div>

            <!-- Quick-insert: math functions -->
            <div class="insert-group">
              <div class="insert-label">数学函数</div>
              <div class="chip-row">
                <el-button v-for="f in mathFns" :key="f" size="small" plain @click="insertToFormula(f + '(')">
                  {{ f }}
                </el-button>
              </div>
            </div>

            <!-- Quick-insert: operators -->
            <div class="insert-group">
              <div class="insert-label">运算符</div>
              <div class="chip-row">
                <el-button v-for="op in operators" :key="op.label" size="small"
                  @click="insertToFormula(op.value)" class="op-btn">{{ op.label }}</el-button>
              </div>
            </div>

            <!-- Formula textarea -->
            <div class="formula-input-area">
              <el-input
                ref="formulaInputRef"
                v-model="formulaExpr"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 5 }"
                placeholder="输入公式，如: sma(close, period)  或  (close - sma(close, 20)) / stddev(close, 20)"
                @blur="onFormulaBlur"
                @click="saveCursorPos"
                @keyup="saveCursorPos"
              />
              <div class="formula-status">
                <el-tag v-if="formulaError" type="danger" size="small">{{ formulaError }}</el-tag>
                <el-tag v-else-if="formulaExpr && formulaValid" type="success" size="small">公式有效</el-tag>
                <el-button size="small" type="primary" plain @click="doPreview" :loading="previewLoading"
                  :disabled="!formulaExpr.trim()">
                  预览
                </el-button>
              </div>
            </div>

            <!-- Common templates -->
            <div class="insert-group">
              <div class="insert-label">常用模板</div>
              <div class="chip-row">
                <el-button v-for="t in templates" :key="t.name" size="small" round
                  @click="formulaExpr = t.expr; doPreview()">{{ t.name }}</el-button>
              </div>
            </div>
          </div>
        </el-col>

        <!-- Right: Preview Chart -->
        <el-col :span="12">
          <div class="preview-panel">
            <div class="preview-title">公式输出预览</div>
            <div ref="previewChartRef" class="chart-box preview-chart" v-loading="previewLoading">
              <div v-if="!previewData && !previewLoading" class="preview-empty">
                输入公式后点击"预览"查看计算结果
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- Create form -->
      <el-divider />
      <div class="create-form">
        <el-row :gutter="12">
          <el-col :span="4">
            <el-input v-model="newForm.indicatorType" placeholder="指标ID (如 CUSTOM_BB)" size="small" />
          </el-col>
          <el-col :span="4">
            <el-input v-model="newForm.displayName" placeholder="显示名称" size="small" />
          </el-col>
          <el-col :span="4">
            <el-input v-model="newForm.description" placeholder="描述（可选）" size="small" />
          </el-col>
          <el-col :span="4">
            <el-input v-model="newForm.params" placeholder='参数 {"period": 14}' size="small" />
          </el-col>
          <el-col :span="4">
            <el-input v-model="newForm.signalThresholds" placeholder='阈值 {"buyBelow": 30}' size="small" />
          </el-col>
          <el-col :span="2">
            <el-input-number v-model="newForm.weight" :min="0" :max="2" :step="0.1" size="small" style="width:100%" />
          </el-col>
          <el-col :span="2">
            <el-button type="success" size="small" @click="createIndicator" :loading="createLoading"
              :disabled="!newForm.indicatorType || !newForm.displayName" style="width:100%">
              生成指标
            </el-button>
          </el-col>
        </el-row>
      </div>
    </el-card>

    <!-- ═══ Section 3: Indicator Table ═══ -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <span class="section-title">已配置指标</span>
      </template>
      <el-table :data="configs" v-loading="tableLoading" stripe border size="small" style="width:100%">
        <el-table-column label="启用" width="70" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" size="small" @change="toggleEnabled(row)" />
          </template>
        </el-table-column>
        <el-table-column label="类型" width="140">
          <template #default="{ row }">
            <el-tag size="small" :type="isBuiltin(row.indicatorType) ? 'info' : 'warning'">
              {{ row.indicatorType }}
            </el-tag>
            <el-tag v-if="isBuiltin(row.indicatorType)" size="small" type="info" effect="plain"
              style="margin-left:4px">内置</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="名称" prop="displayName" width="140" />
        <el-table-column label="计算表达式" min-width="220">
          <template #default="{ row }">
            <el-tooltip v-if="row.formulaExpression" :content="row.formulaExpression" placement="top" :show-after="300">
              <code class="formula-cell">{{ row.formulaExpression }}</code>
            </el-tooltip>
            <span v-else class="no-formula">内置算法</span>
          </template>
        </el-table-column>
        <el-table-column label="权重" prop="weight" width="80" align="center" />
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" text @click="openEditDialog(row)">
              <el-icon><EditPen /></el-icon> 编辑
            </el-button>
            <el-button v-if="!isBuiltin(row.indicatorType)" size="small" type="danger" text @click="confirmDelete(row)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ═══ Edit Dialog ═══ -->
    <el-dialog v-model="editDialogVisible" :title="`编辑指标: ${editForm.displayName}`" width="720px"
      :close-on-click-modal="false" destroy-on-close>
      <el-form :model="editForm" label-width="110px" label-position="left" size="small">
        <el-form-item label="指标类型">
          <el-input v-model="editForm.indicatorType" disabled />
        </el-form-item>
        <el-form-item label="显示名称">
          <el-input v-model="editForm.displayName" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="LaTeX 公式">
          <el-input v-model="editForm.formulaLatex" type="textarea" :rows="2"
            placeholder="LaTeX 展示公式（可选）" />
        </el-form-item>
        <el-form-item label="计算表达式">
          <div style="display:flex;gap:8px;width:100%">
            <el-input v-model="editForm.formulaExpression" type="textarea" :rows="2"
              :disabled="isBuiltin(editForm.indicatorType)"
              placeholder="mathjs 表达式" style="flex:1"
              @blur="validateEditExpression" />
            <el-button v-if="!isBuiltin(editForm.indicatorType)" type="primary"
              @click="openFormulaEditor" style="align-self:flex-start">编辑器</el-button>
          </div>
          <el-tag v-if="editFormulaError" type="danger" size="small" style="margin-top:4px">{{ editFormulaError }}</el-tag>
          <el-tag v-else-if="editForm.formulaExpression && editFormulaValid" type="success" size="small" style="margin-top:4px">公式有效</el-tag>
        </el-form-item>

        <el-divider />

        <el-form-item label="参数">
          <div class="params-editor">
            <div v-for="(val, key) in editParsedParams" :key="key" class="param-row">
              <span class="param-label">{{ paramLabel(key as string) }}</span>
              <el-input-number v-model="editParsedParams[key as string]" :min="1" :max="200" size="small" />
              <el-button v-if="!isBuiltin(editForm.indicatorType)" size="small" text type="danger"
                @click="delete editParsedParams[key as string]"><el-icon><Delete /></el-icon></el-button>
            </div>
            <el-button size="small" text type="primary" @click="showAddParamDialog">+ 添加参数</el-button>
          </div>
        </el-form-item>

        <el-form-item label="信号阈值">
          <div class="params-editor">
            <div v-for="(val, key) in editParsedThresholds" :key="key" class="param-row">
              <span class="param-label" :class="thresholdClass(key as string)">{{ thresholdLabel(key as string) }}</span>
              <el-input-number v-if="typeof val === 'number'" v-model="editParsedThresholds[key as string]" :step="1" size="small" />
              <el-switch v-else-if="typeof val === 'boolean'" v-model="editParsedThresholds[key as string]" size="small" />
              <el-button v-if="!isBuiltin(editForm.indicatorType)" size="small" text type="danger"
                @click="delete editParsedThresholds[key as string]"><el-icon><Delete /></el-icon></el-button>
            </div>
            <el-button size="small" text type="primary" @click="showAddThresholdDialog">+ 添加阈值</el-button>
          </div>
        </el-form-item>

        <el-form-item label="预测权重">
          <el-slider v-model="editForm.weight" :min="0" :max="2" :step="0.1"
            :marks="{ 0: '0', 1: '1', 2: '2' }" show-input style="padding-right: 40px" />
        </el-form-item>
      </el-form>

      <el-divider />
      <AiConfigHelper
        :indicatorType="editForm.indicatorType"
        :displayName="editForm.displayName"
        :currentParams="JSON.stringify(editParsedParams)"
        :currentThresholds="JSON.stringify(editParsedThresholds)"
        :formulaExpression="editForm.formulaExpression ?? undefined"
      />

      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit" :loading="editSaving">保存</el-button>
      </template>
    </el-dialog>

    <!-- Add Param Dialog -->
    <el-dialog v-model="paramDialogVisible" title="添加参数" width="360px">
      <el-form :model="paramForm" label-width="60px" @submit.prevent="confirmAddParam">
        <el-form-item label="键名">
          <el-input v-model="paramForm.key" placeholder="如 period" />
        </el-form-item>
        <el-form-item label="值">
          <el-input-number v-model="paramForm.value" :min="0" :step="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="paramDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAddParam">确认</el-button>
      </template>
    </el-dialog>

    <!-- Add Threshold Dialog -->
    <el-dialog v-model="thresholdDialogVisible" title="添加阈值" width="360px">
      <el-form :model="thresholdForm" label-width="60px" @submit.prevent="confirmAddThreshold">
        <el-form-item label="键名">
          <el-input v-model="thresholdForm.key" placeholder="如 buyBelow" />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="thresholdForm.type">
            <el-radio value="number">数值</el-radio>
            <el-radio value="boolean">布尔</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="thresholdForm.type === 'number'" label="值">
          <el-input-number v-model="thresholdForm.numValue" :step="1" />
        </el-form-item>
        <el-form-item v-else label="值">
          <el-switch v-model="thresholdForm.boolValue" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="thresholdDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAddThreshold">确认</el-button>
      </template>
    </el-dialog>

    <!-- Formula Editor Dialog -->
    <FormulaEditor
      v-model="formulaEditorVisible"
      :initialExpression="formulaEditorInitial"
      @confirm="onFormulaEditorConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, nextTick, onBeforeUnmount } from "vue"
import { ElMessage, ElMessageBox } from "element-plus"
import * as echarts from "echarts"
import {
  getIndicatorConfigs, updateIndicatorConfig,
  createIndicatorConfig, deleteIndicatorConfig, validateFormula,
  getOhlcData, previewFormula,
  type OhlcBarData, type FormulaPreviewResult,
} from "../api/index"
import FormulaEditor from "../components/FormulaEditor.vue"
import AiConfigHelper from "../components/AiConfigHelper.vue"

const BUILTIN_TYPES = new Set(["RSI", "STOCH", "CCI", "ADX", "AO", "MOM"])
function isBuiltin(type: string) { return BUILTIN_TYPES.has(type) }

// ── OHLC field definitions ──
const ohlcFields = [
  { label: "收盘价", value: "close", color: "#5470c6" },
  { label: "开盘价", value: "open", color: "#91cc75" },
  { label: "最高价", value: "high", color: "#ee6666" },
  { label: "最低价", value: "low", color: "#fac858" },
  { label: "成交量", value: "volume", color: "#73c0de" },
]

const seriesFns = [
  { label: "SMA", template: "sma(close, period)" },
  { label: "EMA", template: "ema(close, period)" },
  { label: "STDDEV", template: "stddev(close, period)" },
  { label: "HIGHEST", template: "highest(high, period)" },
  { label: "LOWEST", template: "lowest(low, period)" },
  { label: "CHANGE", template: "change(close, 1)" },
]

const mathFns = ["abs", "sqrt", "log", "exp", "pow", "sin", "cos", "round", "max", "min"]

const operators = [
  { label: "+", value: " + " },
  { label: "-", value: " - " },
  { label: "×", value: " * " },
  { label: "÷", value: " / " },
  { label: "^", value: "^" },
  { label: "(", value: "(" },
  { label: ")", value: ")" },
  { label: ",", value: ", " },
]

const templates = [
  { name: "布林带上轨", expr: "sma(close, period) + 2 * stddev(close, period)" },
  { name: "布林带下轨", expr: "sma(close, period) - 2 * stddev(close, period)" },
  { name: "价格偏离度", expr: "(close - sma(close, period)) / stddev(close, period)" },
  { name: "波动率", expr: "stddev(close, period) / sma(close, period) * 100" },
  { name: "动量EMA", expr: "ema(change(close, 1), period)" },
  { name: "高低差比", expr: "(highest(high, period) - lowest(low, period)) / close * 100" },
]

// ── Section 1: OHLC Chart ──
const ohlcChartRef = ref<HTMLElement | null>(null)
const ohlcLoading = ref(false)
const visibleFields = ref(["close", "open", "high", "low", "volume"])
const ohlcBars = ref<OhlcBarData[]>([])
let ohlcChart: echarts.ECharts | null = null

async function loadOhlcData() {
  ohlcLoading.value = true
  try {
    const result = await getOhlcData(undefined, 60)
    ohlcBars.value = result.bars
    renderOhlcChart()
  } catch (e: any) {
    ElMessage.error("加载行情数据失败: " + (e.message || ""))
  } finally {
    ohlcLoading.value = false
  }
}

function renderOhlcChart() {
  if (!ohlcChartRef.value || ohlcBars.value.length === 0) return
  if (!ohlcChart) {
    ohlcChart = echarts.init(ohlcChartRef.value)
  }

  const dates = ohlcBars.value.map((b) => b.tradeDate)
  const priceFields = ["close", "open", "high", "low"] as const
  const fieldColors: Record<string, string> = {
    close: "#5470c6", open: "#91cc75", high: "#ee6666", low: "#fac858", volume: "#73c0de",
  }

  const series: echarts.SeriesOption[] = []
  for (const f of priceFields) {
    if (!visibleFields.value.includes(f)) continue
    series.push({
      name: f,
      type: "line",
      data: ohlcBars.value.map((b) => b[f]),
      smooth: true,
      showSymbol: false,
      lineStyle: { width: f === "close" ? 2 : 1 },
      itemStyle: { color: fieldColors[f] },
      yAxisIndex: 0,
    })
  }

  if (visibleFields.value.includes("volume")) {
    series.push({
      name: "volume",
      type: "bar",
      data: ohlcBars.value.map((b) => b.volume ?? 0),
      itemStyle: { color: "rgba(115,192,222,0.3)" },
      yAxisIndex: 1,
    })
  }

  const option: echarts.EChartsOption = {
    tooltip: { trigger: "axis" },
    legend: { show: true, top: 0 },
    grid: { left: 60, right: 60, top: 30, bottom: 30 },
    xAxis: { type: "category", data: dates, boundaryGap: false },
    yAxis: [
      { type: "value", name: "价格", scale: true, position: "left" },
      { type: "value", name: "成交量", scale: true, position: "right", splitLine: { show: false },
        axisLabel: { show: visibleFields.value.includes("volume") } },
    ],
    series,
  }
  ohlcChart.setOption(option, true)
}

watch(visibleFields, () => renderOhlcChart())

// ── Section 2: Formula Builder ──
const formulaInputRef = ref<any>(null)
const formulaExpr = ref("")
const formulaValid = ref(false)
const formulaError = ref("")
const previewLoading = ref(false)
const previewData = ref<FormulaPreviewResult | null>(null)
const previewChartRef = ref<HTMLElement | null>(null)
let previewChart: echarts.ECharts | null = null
let cursorPos = 0

function saveCursorPos() {
  nextTick(() => {
    const textarea = formulaInputRef.value?.$el?.querySelector("textarea") as HTMLTextAreaElement | null
    if (textarea) cursorPos = textarea.selectionStart ?? formulaExpr.value.length
  })
}

function insertToFormula(text: string) {
  const before = formulaExpr.value.slice(0, cursorPos)
  const after = formulaExpr.value.slice(cursorPos)
  formulaExpr.value = before + text + after
  cursorPos += text.length
  formulaError.value = ""
  formulaValid.value = false
  nextTick(() => {
    const textarea = formulaInputRef.value?.$el?.querySelector("textarea") as HTMLTextAreaElement | null
    if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(cursorPos, cursorPos)
    }
  })
}

async function onFormulaBlur() {
  saveCursorPos()
  if (!formulaExpr.value.trim()) {
    formulaValid.value = false
    formulaError.value = ""
    return
  }
  try {
    const result = await validateFormula(formulaExpr.value)
    formulaValid.value = result.valid
    formulaError.value = result.error ?? ""
  } catch {
    formulaError.value = "验证请求失败"
  }
}

async function doPreview() {
  if (!formulaExpr.value.trim()) return
  previewLoading.value = true
  try {
    const result = await previewFormula(formulaExpr.value, safeParseJson(newForm.params))
    previewData.value = result
    if (!result.valid) {
      formulaError.value = result.error ?? "公式无效"
      formulaValid.value = false
    } else {
      formulaValid.value = true
      formulaError.value = ""
      renderPreviewChart(result)
    }
  } catch (e: any) {
    formulaError.value = e.message || "预览失败"
  } finally {
    previewLoading.value = false
  }
}

function renderPreviewChart(data: FormulaPreviewResult) {
  if (!previewChartRef.value) return
  if (!previewChart) {
    previewChart = echarts.init(previewChartRef.value)
  }

  const option: echarts.EChartsOption = {
    tooltip: { trigger: "axis" },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: { type: "category", data: data.dates, boundaryGap: false },
    yAxis: { type: "value", scale: true },
    series: [{
      name: "公式输出",
      type: "line",
      data: data.values,
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2, color: "#e6a23c" },
      itemStyle: { color: "#e6a23c" },
      areaStyle: { color: "rgba(230,162,60,0.08)" },
    }],
  }
  previewChart.setOption(option, true)
}

// ── Create form ──
const newForm = reactive({
  indicatorType: "",
  displayName: "",
  description: "",
  params: '{"period": 14}',
  signalThresholds: '{"buyBelow": 30, "sellAbove": 70}',
  weight: 1.0,
})
const createLoading = ref(false)

async function createIndicator() {
  if (!newForm.indicatorType || !newForm.displayName) {
    ElMessage.warning("指标类型ID和显示名称不能为空")
    return
  }
  if (!formulaExpr.value.trim()) {
    ElMessage.warning("请先输入计算表达式")
    return
  }
  try {
    safeParseJson(newForm.params)
    safeParseJson(newForm.signalThresholds)
  } catch {
    ElMessage.error("参数或阈值 JSON 格式不正确")
    return
  }

  createLoading.value = true
  try {
    await createIndicatorConfig({
      indicatorType: newForm.indicatorType.toUpperCase(),
      displayName: newForm.displayName,
      description: newForm.description || null,
      formulaExpression: formulaExpr.value,
      params: newForm.params,
      signalThresholds: newForm.signalThresholds,
      weight: newForm.weight,
    })
    ElMessage.success(`指标 ${newForm.displayName} 已创建`)
    newForm.indicatorType = ""
    newForm.displayName = ""
    newForm.description = ""
    newForm.params = '{"period": 14}'
    newForm.signalThresholds = '{"buyBelow": 30, "sellAbove": 70}'
    newForm.weight = 1.0
    formulaExpr.value = ""
    previewData.value = null
    if (previewChart) previewChart.clear()
    await loadConfigs()
  } catch (e: any) {
    ElMessage.error(e.message || "创建失败")
  } finally {
    createLoading.value = false
  }
}

// ── Section 3: Indicator Table ──
interface IndicatorConfig {
  id: string
  indicatorType: string
  displayName: string
  description: string | null
  formulaLatex: string | null
  formulaExpression: string | null
  params: string
  signalThresholds: string
  enabled: boolean
  weight: number
}

const configs = ref<IndicatorConfig[]>([])
const tableLoading = ref(false)

async function loadConfigs() {
  tableLoading.value = true
  try {
    configs.value = (await getIndicatorConfigs()) as any[]
  } finally {
    tableLoading.value = false
  }
}

async function toggleEnabled(row: IndicatorConfig) {
  try {
    await updateIndicatorConfig(row.id, { enabled: row.enabled })
    ElMessage.success(`${row.displayName} ${row.enabled ? "已启用" : "已禁用"}`)
  } catch (e: any) {
    row.enabled = !row.enabled
    ElMessage.error(e.message || "更新失败")
  }
}

async function confirmDelete(row: IndicatorConfig) {
  try {
    await ElMessageBox.confirm(
      `确定删除指标 "${row.displayName}" (${row.indicatorType}) 吗？`,
      "删除指标",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
    )
    await deleteIndicatorConfig(row.id)
    configs.value = configs.value.filter((c) => c.id !== row.id)
    ElMessage.success("已删除")
  } catch {
    // cancelled
  }
}

// ── Edit Dialog ──
const editDialogVisible = ref(false)
const editSaving = ref(false)
const editFormulaValid = ref(false)
const editFormulaError = ref("")
const editForm = reactive<{
  id: string
  indicatorType: string
  displayName: string
  description: string
  formulaLatex: string
  formulaExpression: string
  weight: number
}>({
  id: "",
  indicatorType: "",
  displayName: "",
  description: "",
  formulaLatex: "",
  formulaExpression: "",
  weight: 1.0,
})
const editParsedParams = reactive<Record<string, any>>({})
const editParsedThresholds = reactive<Record<string, any>>({})

function openEditDialog(row: IndicatorConfig) {
  editForm.id = row.id
  editForm.indicatorType = row.indicatorType
  editForm.displayName = row.displayName
  editForm.description = row.description ?? ""
  editForm.formulaLatex = row.formulaLatex ?? ""
  editForm.formulaExpression = row.formulaExpression ?? ""
  editForm.weight = row.weight
  editFormulaValid.value = false
  editFormulaError.value = ""

  const params = safeParseJson(row.params)
  const thresholds = safeParseJson(row.signalThresholds)
  Object.keys(editParsedParams).forEach((k) => delete editParsedParams[k])
  Object.keys(editParsedThresholds).forEach((k) => delete editParsedThresholds[k])
  Object.assign(editParsedParams, params)
  Object.assign(editParsedThresholds, thresholds)

  editDialogVisible.value = true
}

async function validateEditExpression() {
  if (!editForm.formulaExpression?.trim()) {
    editFormulaValid.value = false
    editFormulaError.value = ""
    return
  }
  try {
    const result = await validateFormula(editForm.formulaExpression)
    editFormulaValid.value = result.valid
    editFormulaError.value = result.error ?? ""
  } catch {
    editFormulaError.value = "验证请求失败"
  }
}

async function saveEdit() {
  editSaving.value = true
  try {
    const params = JSON.stringify(editParsedParams)
    const signalThresholds = JSON.stringify(editParsedThresholds)
    await updateIndicatorConfig(editForm.id, {
      displayName: editForm.displayName,
      description: editForm.description || null,
      formulaLatex: editForm.formulaLatex || null,
      formulaExpression: editForm.formulaExpression || null,
      params,
      signalThresholds,
      weight: editForm.weight,
    })
    ElMessage.success(`${editForm.displayName} 已保存`)
    editDialogVisible.value = false
    await loadConfigs()
  } catch (e: any) {
    ElMessage.error(e.message || "保存失败")
  } finally {
    editSaving.value = false
  }
}

// Formula editor dialog (for edit dialog)
const formulaEditorVisible = ref(false)
const formulaEditorInitial = ref("")

function openFormulaEditor() {
  formulaEditorInitial.value = editForm.formulaExpression ?? ""
  formulaEditorVisible.value = true
}

function onFormulaEditorConfirm(expression: string) {
  editForm.formulaExpression = expression
  editFormulaValid.value = true
  editFormulaError.value = ""
}

// ── Param / Threshold dialogs ──
const paramDialogVisible = ref(false)
const paramForm = reactive({ key: "", value: 14 })
const thresholdDialogVisible = ref(false)
const thresholdForm = reactive({
  key: "", type: "number" as "number" | "boolean", numValue: 50, boolValue: false,
})

function showAddParamDialog() {
  paramForm.key = ""
  paramForm.value = 14
  paramDialogVisible.value = true
}

function confirmAddParam() {
  if (!paramForm.key.trim()) return
  editParsedParams[paramForm.key.trim()] = paramForm.value
  paramDialogVisible.value = false
}

function showAddThresholdDialog() {
  thresholdForm.key = ""
  thresholdForm.type = "number"
  thresholdForm.numValue = 50
  thresholdForm.boolValue = false
  thresholdDialogVisible.value = true
}

function confirmAddThreshold() {
  if (!thresholdForm.key.trim()) return
  const val = thresholdForm.type === "number" ? thresholdForm.numValue : thresholdForm.boolValue
  editParsedThresholds[thresholdForm.key.trim()] = val
  thresholdDialogVisible.value = false
}

// ── Label helpers ──
const paramLabels: Record<string, string> = {
  period: "周期", smoothK: "平滑K", shortPeriod: "短周期", longPeriod: "长周期",
}
function paramLabel(key: string) { return paramLabels[key] ?? key }

const thresholdLabels: Record<string, string> = {
  buyBelow: "买入阈值 (<)", sellAbove: "卖出阈值 (>)",
  strongTrendAbove: "强趋势 (>)", weakTrendBelow: "弱趋势 (<)",
  bullishMultiplier: "多头乘数", bearishMultiplier: "空头乘数",
  zeroCross: "零线穿越",
}
function thresholdLabel(key: string) { return thresholdLabels[key] ?? key }
function thresholdClass(key: string) {
  if (key.includes("buy") || key.includes("bullish")) return "buy-label"
  if (key.includes("sell") || key.includes("bearish")) return "sell-label"
  return ""
}

function safeParseJson(json: string): Record<string, any> {
  try { return JSON.parse(json) } catch { return {} }
}

// ── Resize handler ──
function handleResize() {
  ohlcChart?.resize()
  previewChart?.resize()
}

// ── Init ──
onMounted(async () => {
  window.addEventListener("resize", handleResize)
  await Promise.all([loadOhlcData(), loadConfigs()])
})

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize)
  ohlcChart?.dispose()
  previewChart?.dispose()
})
</script>

<style scoped>
.page { max-width: 1200px; }
.page-header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; }

.flow-diagram { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.flow-step {
  padding: 4px 12px; border-radius: 4px;
  background: #f0f2f5; color: #606266;
}
.flow-step.active { background: #409eff; color: #fff; font-weight: 600; }
.flow-arrow { color: #c0c4cc; font-size: 18px; }

.section-card { margin-bottom: 16px; border-radius: 8px; }
.section-header { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.section-title { font-size: 14px; font-weight: 600; color: #303133; }
.field-checks { flex: 1; display: flex; flex-wrap: wrap; gap: 4px; }

.chart-box { height: 260px; width: 100%; }

/* Formula builder */
.builder-panel { display: flex; flex-direction: column; gap: 10px; }
.insert-group {}
.insert-label { font-size: 11px; color: #909399; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; }
.chip-row { display: flex; flex-wrap: wrap; gap: 4px; }
.chip-row .el-button { font-size: 12px; padding: 4px 8px; }
.op-btn { min-width: 32px; font-weight: 700; font-family: monospace; font-size: 14px; }

.formula-input-area { display: flex; flex-direction: column; gap: 6px; }
.formula-status { display: flex; align-items: center; gap: 8px; }

.preview-panel { display: flex; flex-direction: column; height: 100%; }
.preview-title { font-size: 12px; color: #909399; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; }
.preview-chart { flex: 1; min-height: 300px; }
.preview-empty {
  display: flex; align-items: center; justify-content: center;
  height: 100%; color: #c0c4cc; font-size: 13px;
}

/* Create form */
.create-form {}

/* Table */
.formula-cell {
  font-family: "Courier New", monospace; font-size: 12px; color: #606266;
  display: inline-block; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.no-formula { color: #c0c4cc; font-size: 12px; }

/* Edit dialog params */
.params-editor { display: flex; flex-direction: column; gap: 8px; }
.param-row { display: flex; align-items: center; gap: 8px; }
.param-label { font-size: 13px; color: #606266; min-width: 80px; }
.buy-label { color: #67c23a; font-weight: 600; }
.sell-label { color: #f56c6c; font-weight: 600; }
</style>
