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
      <el-button type="primary" style="margin-left: auto" @click="showAddDialog">新增指标</el-button>
    </div>

    <div v-loading="loading" class="cards-grid">
      <el-card v-for="config in configs" :key="config.id" class="indicator-card"
               :class="{ disabled: !config.enabled }">
        <template #header>
          <div class="card-header">
            <div class="card-title">
              <el-switch v-model="config.enabled" size="small" style="margin-right: 8px" />
              <span>{{ config.displayName }}</span>
              <el-tag v-if="isDirty(config)" size="small" type="warning" style="margin-left: 8px">未保存</el-tag>
            </div>
            <div class="card-header-right">
              <el-tag size="small" type="info">{{ config.indicatorType }}</el-tag>
              <el-button
                v-if="isCustomType(config.indicatorType)"
                size="small" type="danger" text
                @click="confirmDelete(config)"
              ><el-icon><Delete /></el-icon></el-button>
            </div>
          </div>
        </template>

        <div class="card-body">
          <!-- Formula Section -->
          <div class="formula-section">
            <div class="section-label">公式 (LaTeX)</div>
            <el-input
              v-model="config.formulaLatex"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 4 }"
              placeholder="LaTeX 公式，如 RSI = 100 - \frac{100}{1 + RS}"
              size="small"
            />
          </div>

          <!-- Formula Expression with editor button -->
          <div class="formula-section" style="margin-top: 8px">
            <div class="section-label">
              计算表达式 (mathjs)
              <el-tooltip content="可用函数: sma, ema, stddev, highest, lowest, change, sin, cos, tan, log, sqrt, abs, round, ceil, floor, exp, pow, max, min。变量: close, open, high, low, volume, period" placement="top">
                <el-icon style="margin-left: 4px; cursor: help"><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
            <div class="expression-row">
              <el-input
                v-model="config.formulaExpression"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 4 }"
                placeholder="如: sma(close, period) 或 (close - sma(close, 20)) / stddev(close, 20)"
                size="small"
                @blur="validateExpression(config)"
              />
              <el-button size="small" type="primary" @click="openFormulaEditor(config)" style="margin-left: 6px; align-self: flex-start">
                <el-icon><EditPen /></el-icon>
                编辑器
              </el-button>
            </div>
            <el-tag v-if="config._formulaError" type="danger" size="small" style="margin-top: 4px">
              {{ config._formulaError }}
            </el-tag>
            <el-tag v-else-if="config.formulaExpression && config._formulaValid" type="success" size="small" style="margin-top: 4px">
              公式有效
            </el-tag>
          </div>

          <div class="description" v-if="config.description">
            <el-text type="info" size="small">{{ config.description }}</el-text>
          </div>

          <el-divider />

          <div class="params-section">
            <div class="section-label">
              参数
              <el-button size="small" text type="primary" @click="addParam(config)" style="margin-left: 8px">+ 添加</el-button>
            </div>
            <div class="param-row" v-for="(val, key) in config._parsedParams" :key="key">
              <span class="param-label">{{ paramLabel(key as string) }}</span>
              <el-input-number
                v-model="config._parsedParams[key as string]"
                :min="1" :max="200" :step="1" size="small"
              />
              <el-button v-if="isCustomType(config.indicatorType)" size="small" text type="danger" @click="removeParam(config, key as string)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>

          <el-divider />

          <div class="thresholds-section">
            <div class="section-label">
              信号阈值
              <el-button size="small" text type="primary" @click="addThreshold(config)" style="margin-left: 8px">+ 添加</el-button>
            </div>
            <div class="param-row" v-for="(val, key) in config._parsedThresholds" :key="key">
              <span class="param-label" :class="thresholdClass(key as string)">{{ thresholdLabel(key as string) }}</span>
              <el-input-number
                v-if="typeof val === 'number'"
                v-model="config._parsedThresholds[key as string]"
                :step="config.indicatorType === 'ADX' ? 0.1 : 1" size="small"
              />
              <el-switch
                v-else-if="typeof val === 'boolean'"
                v-model="config._parsedThresholds[key as string]"
                size="small"
              />
              <el-button v-if="isCustomType(config.indicatorType)" size="small" text type="danger" @click="removeThreshold(config, key as string)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>

          <el-divider />

          <div class="weight-section">
            <div class="section-label">预测权重</div>
            <el-slider v-model="config.weight" :min="0" :max="2" :step="0.1"
                       :marks="{ 0: '0', 1: '1', 2: '2' }" show-input />
          </div>
          <el-divider />

          <AiConfigHelper
            :indicatorType="config.indicatorType"
            :displayName="config.displayName"
            :currentParams="JSON.stringify(config._parsedParams)"
            :currentThresholds="JSON.stringify(config._parsedThresholds)"
            :formulaExpression="config.formulaExpression ?? undefined"
          />
        </div>

        <div class="card-actions">
          <el-button size="small" type="primary" @click="save(config)" :loading="config._saving">保存</el-button>
          <el-button size="small" @click="resetOne(config)">重置</el-button>
        </div>
      </el-card>
    </div>

    <!-- Add Indicator Dialog -->
    <el-dialog v-model="addDialogVisible" title="新增指标" width="560px">
      <el-form :model="addForm" label-width="110px" label-position="left">
        <el-form-item label="指标类型ID" required>
          <el-input v-model="addForm.indicatorType" placeholder="唯一标识，如 CUSTOM_BB" />
        </el-form-item>
        <el-form-item label="显示名称" required>
          <el-input v-model="addForm.displayName" placeholder="如 布林带" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="addForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="LaTeX公式">
          <el-input v-model="addForm.formulaLatex" type="textarea" :rows="2" placeholder="BB = SMA ± k \cdot \sigma" />
        </el-form-item>
        <el-form-item label="计算表达式">
          <div style="display:flex;gap:6px;width:100%">
            <el-input v-model="addForm.formulaExpression" type="textarea" :rows="2"
              placeholder="sma(close, period) + 2 * stddev(close, period)" style="flex:1" />
            <el-button type="primary" @click="openAddFormulaEditor" style="align-self:flex-start">编辑器</el-button>
          </div>
        </el-form-item>
        <el-form-item label="参数 (JSON)">
          <el-input v-model="addForm.params" placeholder='{"period": 20}' />
        </el-form-item>
        <el-form-item label="信号阈值 (JSON)">
          <el-input v-model="addForm.signalThresholds" placeholder='{"buyBelow": 30, "sellAbove": 70}' />
        </el-form-item>
        <el-form-item label="权重">
          <el-input-number v-model="addForm.weight" :min="0" :max="2" :step="0.1" />
        </el-form-item>
      </el-form>

      <AiConfigHelper
        :indicatorType="addForm.indicatorType"
        :displayName="addForm.displayName"
        :currentParams="addForm.params"
        :currentThresholds="addForm.signalThresholds"
        :formulaExpression="addForm.formulaExpression"
        style="margin-top: 12px"
      />

      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="addIndicator" :loading="addLoading">创建</el-button>
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

    <!-- Formula Editor -->
    <FormulaEditor
      v-model="formulaEditorVisible"
      :initialExpression="formulaEditorInitial"
      @confirm="onFormulaEditorConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue"
import { ElMessage, ElMessageBox } from "element-plus"
import {
  getIndicatorConfigs, updateIndicatorConfig,
  createIndicatorConfig, deleteIndicatorConfig, validateFormula,
} from "../api/index"
import FormulaEditor from "../components/FormulaEditor.vue"
import AiConfigHelper from "../components/AiConfigHelper.vue"

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
  _saving?: boolean
  _parsedParams: Record<string, any>
  _parsedThresholds: Record<string, any>
  _formulaValid?: boolean
  _formulaError?: string
}

const BUILTIN_TYPES = new Set(["RSI", "STOCH", "CCI", "ADX", "AO", "MOM"])

const configs = ref<IndicatorConfig[]>([])
const loading = ref(false)

interface OriginalState {
  params: string
  signalThresholds: string
  weight: number
  enabled: boolean
  formulaLatex: string | null
  formulaExpression: string | null
}
const originals = ref<Map<string, OriginalState>>(new Map())

const addDialogVisible = ref(false)
const addLoading = ref(false)
const addForm = reactive({
  indicatorType: "",
  displayName: "",
  description: "",
  formulaLatex: "",
  formulaExpression: "",
  params: '{"period": 14}',
  signalThresholds: '{"buyBelow": 30, "sellAbove": 70}',
  weight: 1.0,
})

// Formula Editor state
const formulaEditorVisible = ref(false)
const formulaEditorInitial = ref("")
let formulaEditorTarget: IndicatorConfig | null = null
let formulaEditorMode: "edit" | "add" = "edit"

// Param dialog
const paramDialogVisible = ref(false)
const paramForm = reactive({ key: "", value: 14 })
let paramTarget: IndicatorConfig | null = null

// Threshold dialog
const thresholdDialogVisible = ref(false)
const thresholdForm = reactive({ key: "", type: "number" as "number" | "boolean", numValue: 50, boolValue: false })
let thresholdTarget: IndicatorConfig | null = null

function isCustomType(type: string) {
  return !BUILTIN_TYPES.has(type)
}

function safeParseJson(json: string): Record<string, any> {
  try { return JSON.parse(json) } catch { return {} }
}

function hydrateConfig(raw: any): IndicatorConfig {
  return {
    ...raw,
    _parsedParams: safeParseJson(raw.params),
    _parsedThresholds: safeParseJson(raw.signalThresholds),
    _formulaValid: false,
    _formulaError: undefined,
  }
}

function isDirty(config: IndicatorConfig): boolean {
  const orig = originals.value.get(config.id)
  if (!orig) return false
  return (
    config.enabled !== orig.enabled ||
    config.weight !== orig.weight ||
    (config.formulaLatex ?? "") !== (orig.formulaLatex ?? "") ||
    (config.formulaExpression ?? "") !== (orig.formulaExpression ?? "") ||
    JSON.stringify(config._parsedParams) !== orig.params ||
    JSON.stringify(config._parsedThresholds) !== orig.signalThresholds
  )
}

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

// Formula editor
function openFormulaEditor(config: IndicatorConfig) {
  formulaEditorTarget = config
  formulaEditorMode = "edit"
  formulaEditorInitial.value = config.formulaExpression ?? ""
  formulaEditorVisible.value = true
}

function openAddFormulaEditor() {
  formulaEditorTarget = null
  formulaEditorMode = "add"
  formulaEditorInitial.value = addForm.formulaExpression ?? ""
  formulaEditorVisible.value = true
}

function onFormulaEditorConfirm(expression: string) {
  if (formulaEditorMode === "edit" && formulaEditorTarget) {
    formulaEditorTarget.formulaExpression = expression
    formulaEditorTarget._formulaValid = true
    formulaEditorTarget._formulaError = undefined
  } else {
    addForm.formulaExpression = expression
  }
}

// Param management
function addParam(config: IndicatorConfig) {
  paramTarget = config
  paramForm.key = ""
  paramForm.value = 14
  paramDialogVisible.value = true
}

function confirmAddParam() {
  if (!paramForm.key.trim() || !paramTarget) return
  paramTarget._parsedParams[paramForm.key.trim()] = paramForm.value
  paramDialogVisible.value = false
}

function removeParam(config: IndicatorConfig, key: string) {
  delete config._parsedParams[key]
}

// Threshold management
function addThreshold(config: IndicatorConfig) {
  thresholdTarget = config
  thresholdForm.key = ""
  thresholdForm.type = "number"
  thresholdForm.numValue = 50
  thresholdForm.boolValue = false
  thresholdDialogVisible.value = true
}

function confirmAddThreshold() {
  if (!thresholdForm.key.trim() || !thresholdTarget) return
  const val = thresholdForm.type === "number" ? thresholdForm.numValue : thresholdForm.boolValue
  thresholdTarget._parsedThresholds[thresholdForm.key.trim()] = val
  thresholdDialogVisible.value = false
}

function removeThreshold(config: IndicatorConfig, key: string) {
  delete config._parsedThresholds[key]
}

async function validateExpression(config: IndicatorConfig) {
  if (!config.formulaExpression) {
    config._formulaValid = false
    config._formulaError = undefined
    return
  }
  try {
    const result = await validateFormula(config.formulaExpression)
    config._formulaValid = result.valid
    config._formulaError = result.error
  } catch {
    config._formulaError = "验证请求失败"
    config._formulaValid = false
  }
}

async function save(config: IndicatorConfig) {
  config._saving = true
  const params = JSON.stringify(config._parsedParams)
  const signalThresholds = JSON.stringify(config._parsedThresholds)
  try {
    await updateIndicatorConfig(config.id, {
      params,
      signalThresholds,
      enabled: config.enabled,
      weight: config.weight,
      formulaLatex: config.formulaLatex,
      formulaExpression: config.formulaExpression,
    })
    config.params = params
    config.signalThresholds = signalThresholds
    originals.value.set(config.id, {
      params,
      signalThresholds,
      weight: config.weight,
      enabled: config.enabled,
      formulaLatex: config.formulaLatex,
      formulaExpression: config.formulaExpression,
    })
    ElMessage.success(`${config.displayName} 已保存`)
  } catch (e: any) {
    ElMessage.error(e.message || "保存失败")
  } finally {
    config._saving = false
  }
}

function resetOne(config: IndicatorConfig) {
  const orig = originals.value.get(config.id)
  if (orig) {
    config.params = orig.params
    config.signalThresholds = orig.signalThresholds
    config.weight = orig.weight
    config.enabled = orig.enabled
    config.formulaLatex = orig.formulaLatex
    config.formulaExpression = orig.formulaExpression
    config._parsedParams = safeParseJson(orig.params)
    config._parsedThresholds = safeParseJson(orig.signalThresholds)
    config._formulaError = undefined
    config._formulaValid = false
    ElMessage.info("已恢复到上次保存的值")
  }
}

async function confirmDelete(config: IndicatorConfig) {
  try {
    await ElMessageBox.confirm(
      `确定删除指标 "${config.displayName}" (${config.indicatorType}) 吗？`,
      "删除指标",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
    )
    await deleteIndicatorConfig(config.id)
    configs.value = configs.value.filter((c) => c.id !== config.id)
    originals.value.delete(config.id)
    ElMessage.success("已删除")
  } catch {
    // cancelled
  }
}

function showAddDialog() {
  addForm.indicatorType = ""
  addForm.displayName = ""
  addForm.description = ""
  addForm.formulaLatex = ""
  addForm.formulaExpression = ""
  addForm.params = '{"period": 14}'
  addForm.signalThresholds = '{"buyBelow": 30, "sellAbove": 70}'
  addForm.weight = 1.0
  addDialogVisible.value = true
}

async function addIndicator() {
  if (!addForm.indicatorType || !addForm.displayName) {
    ElMessage.warning("指标类型ID和显示名称不能为空")
    return
  }
  try {
    safeParseJson(addForm.params)
    safeParseJson(addForm.signalThresholds)
  } catch {
    ElMessage.error("参数或阈值 JSON 格式不正确")
    return
  }

  addLoading.value = true
  try {
    const created = await createIndicatorConfig({
      indicatorType: addForm.indicatorType.toUpperCase(),
      displayName: addForm.displayName,
      description: addForm.description || null,
      formulaLatex: addForm.formulaLatex || null,
      formulaExpression: addForm.formulaExpression || null,
      params: addForm.params,
      signalThresholds: addForm.signalThresholds,
      weight: addForm.weight,
    })
    const hydrated = hydrateConfig(created)
    configs.value.push(hydrated)
    originals.value.set(created.id, {
      params: created.params,
      signalThresholds: created.signalThresholds,
      weight: created.weight,
      enabled: created.enabled,
      formulaLatex: created.formulaLatex,
      formulaExpression: created.formulaExpression,
    })
    addDialogVisible.value = false
    ElMessage.success(`指标 ${addForm.displayName} 已创建`)
  } catch (e: any) {
    ElMessage.error(e.message || "创建失败")
  } finally {
    addLoading.value = false
  }
}

async function loadConfigs() {
  loading.value = true
  try {
    const raw = await getIndicatorConfigs()
    configs.value = (raw as any[]).map(hydrateConfig)
    for (const c of configs.value) {
      originals.value.set(c.id, {
        params: c.params,
        signalThresholds: c.signalThresholds,
        weight: c.weight,
        enabled: c.enabled,
        formulaLatex: c.formulaLatex,
        formulaExpression: c.formulaExpression,
      })
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadConfigs)
</script>

<style scoped>
.page { max-width: 1200px; }
.page-header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 20px; }

.flow-diagram { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.flow-step {
  padding: 4px 12px; border-radius: 4px;
  background: #f0f2f5; color: #606266;
}
.flow-step.active { background: #409eff; color: #fff; font-weight: 600; }
.flow-arrow { color: #c0c4cc; font-size: 18px; }

.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }

.indicator-card.disabled { opacity: 0.6; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header-right { display: flex; align-items: center; gap: 6px; }
.card-title { display: flex; align-items: center; font-weight: 600; }

.section-label { font-size: 12px; color: #909399; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; display: flex; align-items: center; }
.description { margin-top: 8px; }

.expression-row { display: flex; align-items: flex-start; }

.param-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; }
.param-label { font-size: 13px; color: #606266; min-width: 80px; }
.buy-label { color: #67c23a; font-weight: 600; }
.sell-label { color: #f56c6c; font-weight: 600; }

.weight-section { padding-right: 40px; }
.card-actions { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }

.el-divider { margin: 12px 0; }
</style>
