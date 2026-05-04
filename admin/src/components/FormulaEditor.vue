<template>
  <el-dialog
    v-model="visible"
    title="可视化公式编辑器"
    width="780px"
    :close-on-click-modal="false"
    @open="onOpen"
  >
    <div class="formula-editor">
      <!-- Live expression preview -->
      <div class="preview-bar">
        <div class="preview-label">当前公式</div>
        <div class="preview-expr" :class="{ 'has-error': validationError }">
          <code>{{ expression || '点击下方元素构建公式...' }}</code>
        </div>
        <div class="preview-status">
          <el-tag v-if="validationError" type="danger" size="small">{{ validationError }}</el-tag>
          <el-tag v-else-if="expression && validationOk" type="success" size="small">有效</el-tag>
        </div>
      </div>

      <!-- Expression textarea -->
      <el-input
        ref="inputRef"
        v-model="expression"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 6 }"
        placeholder="直接输入或通过下方面板选取构建公式"
        @blur="validate"
        @click="saveCursor"
        @keyup="saveCursor"
      />

      <!-- Build panels -->
      <div class="build-panels">
        <!-- Left: data source selection -->
        <div class="panel data-panel">
          <div class="panel-title">数据源</div>

          <!-- OHLCV fields (NormalizedMarketSnapshot) -->
          <div class="data-group">
            <div class="data-group-label">行情数据 (OHLCV)</div>
            <div class="chip-row">
              <el-button
                v-for="f in ohlcvFields"
                :key="f.value"
                size="small"
                :type="f.color"
                plain
                @click="insert(f.value)"
              >{{ f.label }}</el-button>
            </div>
          </div>

          <!-- Indicator params -->
          <div class="data-group">
            <div class="data-group-label">参数变量</div>
            <div class="chip-row">
              <el-button size="small" @click="insert('period')">period</el-button>
              <el-button size="small" @click="insert('n')">n (数据长度)</el-button>
            </div>
          </div>
        </div>

        <!-- Right: function + operator panels -->
        <div class="panel fn-panel">
          <div class="panel-title">序列函数</div>
          <div class="fn-grid">
            <div
              v-for="f in seriesFns"
              :key="f.label"
              class="fn-card"
              @click="insert(f.template)"
            >
              <div class="fn-name">{{ f.label }}</div>
              <div class="fn-desc">{{ f.desc }}</div>
            </div>
          </div>

          <div class="panel-title" style="margin-top: 12px">数学函数</div>
          <div class="chip-row">
            <el-button
              v-for="f in mathFns"
              :key="f.label"
              size="small"
              plain
              @click="insert(f.template)"
            >{{ f.label }}</el-button>
          </div>

          <div class="panel-title" style="margin-top: 12px">运算符</div>
          <div class="chip-row ops-row">
            <el-button
              v-for="op in operators"
              :key="op.label"
              size="small"
              :type="op.type"
              @click="insert(op.value)"
              class="op-btn"
            >{{ op.label }}</el-button>
          </div>

          <div class="chip-row" style="margin-top: 8px">
            <el-button size="small" plain @click="insert('pi')">PI</el-button>
            <el-button size="small" plain @click="insert('e')">E</el-button>
            <el-button size="small" type="info" plain @click="insertNumber">插入数值</el-button>
            <el-button size="small" type="danger" plain @click="clearExpression">清空</el-button>
            <el-button size="small" type="warning" plain @click="backspace">退格</el-button>
          </div>
        </div>
      </div>

      <!-- Template examples -->
      <div class="templates-section">
        <div class="panel-title">常用模板</div>
        <div class="chip-row">
          <el-button
            v-for="t in templates"
            :key="t.name"
            size="small"
            round
            @click="applyTemplate(t.expr)"
          >{{ t.name }}</el-button>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="doValidate">验证</el-button>
      <el-button type="success" @click="confirm" :disabled="!!validationError">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from "vue"
import { validateFormula } from "../api/index"
import { ElMessageBox } from "element-plus"

const props = defineProps<{
  modelValue: boolean
  initialExpression?: string
}>()

const emit = defineEmits<{
  "update:modelValue": [val: boolean]
  confirm: [expression: string]
}>()

const visible = ref(props.modelValue)
const expression = ref("")
const validationOk = ref(false)
const validationError = ref("")
const inputRef = ref<any>(null)
let cursorPos = 0

watch(() => props.modelValue, (v) => { visible.value = v })
watch(visible, (v) => emit("update:modelValue", v))

const ohlcvFields = [
  { label: "收盘价 close", value: "close", color: "primary" as const },
  { label: "开盘价 open", value: "open", color: "success" as const },
  { label: "最高价 high", value: "high", color: "warning" as const },
  { label: "最低价 low", value: "low", color: "danger" as const },
  { label: "成交量 volume", value: "volume", color: "info" as const },
]

const seriesFns = [
  { label: "SMA", desc: "简单移动平均", template: "sma(close, period)" },
  { label: "EMA", desc: "指数移动平均", template: "ema(close, period)" },
  { label: "STDDEV", desc: "标准差", template: "stddev(close, period)" },
  { label: "HIGHEST", desc: "区间最高", template: "highest(high, period)" },
  { label: "LOWEST", desc: "区间最低", template: "lowest(low, period)" },
  { label: "CHANGE", desc: "变化量", template: "change(close, 1)" },
]

const mathFns = [
  { label: "abs", template: "abs(" },
  { label: "sqrt", template: "sqrt(" },
  { label: "log", template: "log(" },
  { label: "exp", template: "exp(" },
  { label: "pow", template: "pow(" },
  { label: "sin", template: "sin(" },
  { label: "cos", template: "cos(" },
  { label: "round", template: "round(" },
  { label: "max", template: "max(" },
  { label: "min", template: "min(" },
]

const operators = [
  { label: "+", value: " + ", type: undefined },
  { label: "-", value: " - ", type: undefined },
  { label: "×", value: " * ", type: undefined },
  { label: "÷", value: " / ", type: undefined },
  { label: "^", value: "^", type: undefined },
  { label: "(", value: "(", type: "info" as const },
  { label: ")", value: ")", type: "info" as const },
  { label: ",", value: ", ", type: "info" as const },
]

const templates = [
  { name: "布林带上轨", expr: "sma(close, period) + 2 * stddev(close, period)" },
  { name: "布林带下轨", expr: "sma(close, period) - 2 * stddev(close, period)" },
  { name: "价格偏离度", expr: "(close - sma(close, period)) / stddev(close, period)" },
  { name: "均价比", expr: "sma(close, period) / ema(close, period)" },
  { name: "波动率", expr: "stddev(close, period) / sma(close, period) * 100" },
  { name: "动量EMA", expr: "ema(change(close, 1), period)" },
  { name: "高低差比", expr: "(highest(high, period) - lowest(low, period)) / close * 100" },
]

function onOpen() {
  expression.value = props.initialExpression ?? ""
  validationOk.value = false
  validationError.value = ""
  cursorPos = expression.value.length
}

function saveCursor() {
  nextTick(() => {
    const textarea = inputRef.value?.$el?.querySelector("textarea") as HTMLTextAreaElement | null
    if (textarea) cursorPos = textarea.selectionStart ?? expression.value.length
  })
}

function insert(text: string) {
  const before = expression.value.slice(0, cursorPos)
  const after = expression.value.slice(cursorPos)
  expression.value = before + text + after
  cursorPos = cursorPos + text.length
  validationError.value = ""
  validationOk.value = false
  focusTextarea()
}

function focusTextarea() {
  nextTick(() => {
    const textarea = inputRef.value?.$el?.querySelector("textarea") as HTMLTextAreaElement | null
    if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(cursorPos, cursorPos)
    }
  })
}

function clearExpression() {
  expression.value = ""
  cursorPos = 0
  validationError.value = ""
  validationOk.value = false
  focusTextarea()
}

function backspace() {
  if (cursorPos > 0) {
    expression.value = expression.value.slice(0, cursorPos - 1) + expression.value.slice(cursorPos)
    cursorPos--
    focusTextarea()
  }
}

function applyTemplate(expr: string) {
  expression.value = expr
  cursorPos = expr.length
  validationError.value = ""
  validationOk.value = false
  focusTextarea()
}

async function insertNumber() {
  try {
    const { value } = await ElMessageBox.prompt("请输入数值", "插入数值", {
      inputPattern: /^-?\d+(\.\d+)?$/,
      inputErrorMessage: "请输入有效数值",
      inputValue: "2",
    })
    insert(value)
  } catch {
    // cancelled
  }
}

async function validate() {
  if (!expression.value?.trim()) {
    validationOk.value = false
    validationError.value = ""
    return
  }
  try {
    const result = await validateFormula(expression.value)
    validationOk.value = result.valid
    validationError.value = result.error ?? ""
  } catch {
    validationError.value = "验证请求失败"
    validationOk.value = false
  }
}

async function doValidate() {
  await validate()
}

async function confirm() {
  await validate()
  if (validationError.value) return
  emit("confirm", expression.value)
  visible.value = false
}
</script>

<style scoped>
.formula-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.preview-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f5f7fa;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.preview-label {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}

.preview-expr {
  flex: 1;
  font-family: "Courier New", monospace;
  font-size: 13px;
  color: #303133;
  min-height: 20px;
  word-break: break-all;
}

.preview-expr.has-error {
  color: #f56c6c;
}

.preview-expr code {
  background: none;
  padding: 0;
}

.preview-status {
  flex-shrink: 0;
}

.build-panels {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 14px;
}

.panel {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px;
  background: #fafbfc;
}

.panel-title {
  font-size: 12px;
  color: #909399;
  font-weight: 700;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.data-group {
  margin-bottom: 10px;
}

.data-group-label {
  font-size: 11px;
  color: #606266;
  margin-bottom: 6px;
  font-weight: 600;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip-row .el-button {
  font-size: 12px;
  padding: 4px 10px;
}

.fn-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.fn-card {
  padding: 8px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  background: #fff;
  text-align: center;
}

.fn-card:hover {
  border-color: #409eff;
  background: #ecf5ff;
  transform: translateY(-1px);
}

.fn-name {
  font-size: 13px;
  font-weight: 700;
  color: #409eff;
  font-family: "Courier New", monospace;
}

.fn-desc {
  font-size: 10px;
  color: #909399;
  margin-top: 2px;
}

.ops-row .el-button {
  min-width: 40px;
  font-weight: 700;
  font-size: 14px;
}

.op-btn {
  font-family: monospace;
}

.templates-section {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fafbfc;
}
</style>
