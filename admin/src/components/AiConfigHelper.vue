<template>
  <div class="ai-config-helper">
    <div class="helper-toggle" @click="expanded = !expanded">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      <span>AI 配置助手</span>
      <svg :class="['chevron', { open: expanded }]" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>

    <div v-if="expanded" class="helper-body">
      <div class="helper-messages" ref="msgsRef">
        <div v-if="messages.length === 0 && !streaming" class="helper-hint">
          <p>我可以帮你配置这个指标。试试问：</p>
          <div class="hint-btns">
            <el-button v-for="q in suggestedQuestions" :key="q" size="small" round @click="send(q)">{{ q }}</el-button>
          </div>
        </div>
        <div v-for="(msg, i) in messages" :key="i" :class="['hmsg', msg.role]">
          <div class="hmsg-content" v-html="renderMd(msg.content)" />
        </div>
        <div v-if="streaming" class="hmsg assistant">
          <div class="hmsg-content">
            <span v-if="streamBuf" v-html="renderMd(streamBuf)" />
            <span v-else class="dots"><span /><span /><span /></span>
            <span v-if="streamBuf" class="cursor" />
          </div>
        </div>
      </div>
      <div class="helper-input">
        <el-input
          v-model="input"
          size="small"
          placeholder="问关于配置的问题..."
          @keydown.enter.prevent="send()"
          :disabled="streaming"
        >
          <template #append>
            <el-button size="small" type="primary" @click="send()" :disabled="!input.trim() || streaming">问</el-button>
          </template>
        </el-input>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue"
import { streamAdminChat } from "../api/index"

const props = defineProps<{
  indicatorType?: string
  displayName?: string
  currentParams?: string
  currentThresholds?: string
  formulaExpression?: string
}>()

interface Msg { role: "user" | "assistant"; content: string }

const expanded = ref(false)
const messages = ref<Msg[]>([])
const input = ref("")
const streaming = ref(false)
const streamBuf = ref("")
const msgsRef = ref<HTMLElement | null>(null)

const suggestedQuestions = computed(() => {
  const name = props.displayName || props.indicatorType || "这个指标"
  return [
    `${name}的最佳参数配置是什么？`,
    "有哪些可用的数据字段？",
    `帮我生成${name}的计算公式`,
    "信号阈值应该怎么设？",
  ]
})

function buildContext(): string {
  const parts = ["[上下文: 指标配置页面]"]
  parts.push(`系统可用数据字段: open, high, low, close, volume (来自NormalizedMarketSnapshot表)`)
  parts.push(`可用序列函数: sma(series, period), ema(series, period), stddev(series, period), highest(series, period), lowest(series, period), change(series, n)`)
  parts.push(`可用数学函数: abs, sqrt, log, exp, pow, sin, cos, round, max, min`)
  parts.push(`参数变量: period, n`)
  if (props.indicatorType) parts.push(`当前指标类型: ${props.indicatorType}`)
  if (props.displayName) parts.push(`指标名称: ${props.displayName}`)
  if (props.currentParams) parts.push(`当前参数: ${props.currentParams}`)
  if (props.currentThresholds) parts.push(`当前阈值: ${props.currentThresholds}`)
  if (props.formulaExpression) parts.push(`当前公式: ${props.formulaExpression}`)
  return parts.join("\n")
}

function scrollBottom() {
  nextTick(() => {
    if (msgsRef.value) msgsRef.value.scrollTop = msgsRef.value.scrollHeight
  })
}

function renderMd(text: string): string {
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-bl"><code>$2</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code class="il-code">$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\n/g, "<br>")
  return html
}

function send(text?: string) {
  const msg = text ?? input.value.trim()
  if (!msg || streaming.value) return

  const contextMsg = `${buildContext()}\n\n用户问题: ${msg}`
  messages.value.push({ role: "user", content: msg })
  input.value = ""
  streaming.value = true
  streamBuf.value = ""
  scrollBottom()

  const history = messages.value.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))

  streamAdminChat(
    contextMsg,
    history,
    (chunk) => { streamBuf.value += chunk; scrollBottom() },
    () => {
      messages.value.push({ role: "assistant", content: streamBuf.value })
      streamBuf.value = ""
      streaming.value = false
      scrollBottom()
    },
    (err) => {
      messages.value.push({ role: "assistant", content: `错误: ${err}` })
      streamBuf.value = ""
      streaming.value = false
      scrollBottom()
    },
  )
}

defineExpose({ expanded })
</script>

<style scoped>
.ai-config-helper {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  background: #fafbfc;
}

.helper-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  transition: background .15s;
  user-select: none;
}

.helper-toggle:hover {
  background: #f0f2ff;
  color: #409eff;
}

.helper-toggle svg.chevron {
  margin-left: auto;
  transition: transform .2s;
}

.helper-toggle svg.chevron.open {
  transform: rotate(180deg);
}

.helper-body {
  border-top: 1px solid #e4e7ed;
}

.helper-messages {
  max-height: 220px;
  overflow-y: auto;
  padding: 8px 10px;
}

.helper-hint {
  text-align: center;
  font-size: 12px;
  color: #909399;
  padding: 4px 0;
}

.helper-hint p {
  margin: 0 0 8px;
}

.hint-btns {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}

.hmsg {
  margin-bottom: 8px;
}

.hmsg.user .hmsg-content {
  background: #ecf5ff;
  color: #303133;
  margin-left: 20%;
  text-align: right;
}

.hmsg.assistant .hmsg-content {
  background: #fff;
  border: 1px solid #ebeef5;
  margin-right: 10%;
}

.hmsg-content {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.hmsg-content :deep(.code-bl) {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 6px;
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
  margin: 4px 0;
}

.hmsg-content :deep(.il-code) {
  background: #e8eaed;
  padding: 1px 3px;
  border-radius: 2px;
  font-size: 11px;
}

.hmsg-content :deep(strong) {
  font-weight: 600;
}

.cursor {
  display: inline-block;
  width: 2px;
  height: 12px;
  background: #409eff;
  margin-left: 1px;
  vertical-align: middle;
  animation: blink .8s step-end infinite;
}

@keyframes blink { 50% { opacity: 0; } }

.dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}

.dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #c0c4cc;
  animation: dotbounce 1.2s infinite ease-in-out;
}

.dots span:nth-child(1) { animation-delay: 0s; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotbounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.helper-input {
  padding: 8px 10px;
  border-top: 1px solid #ebeef5;
  background: #fff;
}
</style>
