<template>
  <!-- Floating trigger button -->
  <div v-if="!open" class="ai-fab" :style="fabStyle" @mousedown="startDragFab" @click.stop="toggleOpen">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  </div>

  <!-- Floating panel -->
  <div v-if="open" class="ai-panel" :style="panelStyle">
    <!-- Drag handle / header -->
    <div class="panel-header" @mousedown="startDragPanel">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#409eff" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span class="panel-title">AI 助手</span>
      <el-tag size="small" type="info" style="margin-left: 4px">{{ currentPageLabel }}</el-tag>
      <div style="flex:1" />

      <!-- Session selector dropdown -->
      <el-dropdown trigger="click" @command="onSessionCommand" size="small" max-height="360" class="ai-session-dropdown"
        popper-class="ai-dropdown-menu">
        <el-button size="small" text class="header-btn" title="切换会话">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="9" y1="12" x2="13" y2="12" />
          </svg>
          <span v-if="activeSessionTitle" class="current-session-label">{{ activeSessionTitle }}</span>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="__new">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              新建对话
            </el-dropdown-item>
            <template v-if="sessions.length > 0">
              <el-dropdown-item divided disabled>
                <span style="font-size:11px">历史会话 ({{ sessions.length }})</span>
              </el-dropdown-item>
              <el-dropdown-item v-for="s in sessions.slice(0, 20)" :key="s.id" :command="s.id"
                :class="{ 'active-session': s.id === sessionId }">
                <div class="session-row">
                  <span class="session-label">{{ s.title || '未命名会话' }}</span>
                  <svg class="session-del" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    @click.stop="deleteSessionItem(s.id)">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>
              </el-dropdown-item>
            </template>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-button size="small" text class="header-btn" @click="newSession" title="新对话">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </el-button>
      <el-button size="small" text class="header-btn" @click="toggleOpen" title="最小化">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </el-button>
    </div>

    <!-- Messages -->
    <div class="panel-messages" ref="messagesRef">
      <div class="welcome" v-if="messages.length === 0 && !streaming">
        <div class="welcome-icon">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#c0c4cc" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <p>你好！我可以结合当前 <b>{{ currentPageLabel }}</b> 页面上下文帮你分析数据、排查问题。</p>
        <div class="quick-btns">
          <el-button v-for="q in contextQuestions" :key="q" size="small" round @click="sendMessage(q)">{{ q
          }}</el-button>
        </div>
      </div>

      <div v-for="(msg, i) in messages" :key="i" :class="['message', msg.role]">
        <div class="avatar">
          <svg v-if="msg.role === 'assistant'" viewBox="0 0 24 24" width="14" height="14" fill="none"
            stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div class="bubble">
          <div class="bubble-content" v-html="renderMarkdown(msg.content)" />
        </div>
      </div>

      <div v-if="streaming" class="message assistant">
        <div class="avatar">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <div class="bubble">
          <div class="bubble-content" v-if="streamBuffer">
            <span v-html="renderMarkdown(streamBuffer)" />
            <span class="cursor-blink" />
          </div>
          <div v-else class="bubble-content thinking">
            <span class="dot" /><span class="dot" /><span class="dot" />
          </div>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="panel-input">
      <div class="input-row">
        <el-dropdown trigger="click" size="small" popper-class="ai-dropdown-menu" @command="(id: string) => selectedModel = id">
          <button class="model-selector-btn" title="切换模型">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span class="model-selector-label">{{ currentModelMeta?.name || '模型' }}</span>
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="m in models" :key="m.id" :command="m.id" :class="{ 'active-model': selectedModel === m.id }">
                <div class="model-option">
                  <div class="model-option-left">
                    <span class="model-option-name">{{ m.name || m.id }}</span>
                    <span class="model-option-desc">{{ m.capability }}</span>
                  </div>
                  <el-tag v-if="m.speed" size="small" :type="m.speed === '快' ? 'success' : 'warning'">{{ m.speed }}</el-tag>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-input ref="inputRef" v-model="input" placeholder="输入问题... (↑↓翻历史, Esc关闭)" @keydown="onInputKeydown"
          :disabled="streaming" size="small">
          <template #append>
            <el-button v-if="streaming" type="danger" @click="stopStreaming" size="small">停止</el-button>
            <el-button v-else type="primary" @click="sendMessage()" :disabled="!input.trim()" size="small">发送</el-button>
          </template>
        </el-input>
      </div>
    </div>

    <!-- Resize handle -->
    <div class="resize-handle" @mousedown="startResize" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from "vue"
import { useRoute } from "vue-router"
import {
  streamAdminChat, getAdminChatSessions,
  getAdminChatSession, deleteAdminChatSession,
  getAdminModels, type AdminModel,
} from "../api/index"

interface ChatMsg {
  role: "user" | "assistant"
  content: string
}

interface SessionItem {
  id: string
  title: string | null
  createdAt: string
}

const STORAGE_KEY_SESSION = "admin_chat_session_id"
const STORAGE_KEY_HISTORY = "admin_chat_history"
const route = useRoute()

const open = ref(false)
const messages = ref<ChatMsg[]>([])
const input = ref("")
const streaming = ref(false)
const streamBuffer = ref("")
const messagesRef = ref<HTMLElement | null>(null)
const inputRef = ref<any>(null)
const sessionId = ref<string | null>(localStorage.getItem(STORAGE_KEY_SESSION))
const sessions = ref<SessionItem[]>([])
const models = ref<AdminModel[]>([])
const selectedModel = ref("")
let activeController: AbortController | null = null

// Restore model from localStorage, sanitize corrupted values
{
  const stored = localStorage.getItem("admin_chat_model") || ""
  if (stored && !stored.startsWith("[") && !stored.startsWith("{")) {
    selectedModel.value = stored
  } else {
    localStorage.removeItem("admin_chat_model")
  }
}

const sentHistory = ref<string[]>([])
let historyIndex = -1
let historyDraft = ""

// ── Drag / resize state ──
const fabPos = ref({ x: -1, y: -1 })
const panelPos = ref({ x: -1, y: -1 })
const panelSize = ref({ w: 420, h: 540 })
let dragging = false
let resizing = false
let dragStartX = 0
let dragStartY = 0
let dragStartPosX = 0
let dragStartPosY = 0
let dragTarget: "fab" | "panel" = "fab"
let didMove = false
let resizeStartW = 0
let resizeStartH = 0

// ── Page context ──
const PAGE_LABELS: Record<string, string> = {
  "/overview": "系统概览",
  "/cron": "定时任务",
  "/database": "数据中心",
  "/news-sources": "新闻源管理",
  "/indicators": "指标配置",
  "/assistant": "AI 助手",
}

const currentPageLabel = computed(() => PAGE_LABELS[route.path] ?? "管理后台")

const activeSessionTitle = computed(() => {
  if (!sessionId.value) return ""
  const s = sessions.value.find((s) => s.id === sessionId.value)
  return s?.title || ""
})

const PAGE_QUESTIONS: Record<string, string[]> = {
  "/overview": ["系统运行状态如何？", "各表数据量统计？", "最近有什么异常？"],
  "/cron": ["最近的新闻抓取成功率？", "哪些新闻源抓取失败了？", "消化任务运行情况如何？"],
  "/database": ["这张表最近有哪些变化？", "帮我分析这些数据的趋势", "数据质量有什么问题吗？"],
  "/news-sources": ["哪些新闻源还能正常工作？", "最近抓取了多少条新闻？", "建议添加什么新的新闻源？"],
  "/indicators": ["当前启用了哪些指标？", "各指标的信号阈值是否合理？", "如何优化指标权重？"],
}

const contextQuestions = computed(() => PAGE_QUESTIONS[route.path] ?? [
  "数据库各表有多少条数据？",
  "最近的新闻消化摘要是什么？",
  "有哪些失败的任务日志？",
])

const currentModelMeta = computed(() => models.value.find((m) => m.id === selectedModel.value))

// ── Layout ──
const fabStyle = computed(() => {
  const x = fabPos.value.x >= 0 ? fabPos.value.x : window.innerWidth - 80
  const y = fabPos.value.y >= 0 ? fabPos.value.y : window.innerHeight - 80
  return { left: x + "px", top: y + "px" }
})

const panelStyle = computed(() => {
  const x = panelPos.value.x >= 0 ? panelPos.value.x : window.innerWidth - panelSize.value.w - 24
  const y = panelPos.value.y >= 0 ? panelPos.value.y : 60
  return {
    left: x + "px",
    top: y + "px",
    width: panelSize.value.w + "px",
    height: panelSize.value.h + "px",
  }
})

// ── LocalStorage history cache ──
function getCachedHistory(sid: string): ChatMsg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY)
    if (!raw) return []
    const all = JSON.parse(raw)
    return all[sid] || []
  } catch { return [] }
}

function setCachedHistory(sid: string, msgs: ChatMsg[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY)
    const all = raw ? JSON.parse(raw) : {}
    all[sid] = msgs.slice(-100)
    const keys = Object.keys(all)
    if (keys.length > 30) {
      for (const k of keys.slice(0, keys.length - 30)) delete all[k]
    }
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(all))
  } catch { /* ok */ }
}

function removeCachedHistory(sid: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY)
    if (!raw) return
    const all = JSON.parse(raw)
    delete all[sid]
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(all))
  } catch { /* ok */ }
}

// ── Open / close ──
function toggleOpen() {
  if (didMove) return
  open.value = !open.value
  if (open.value) {
    nextTick(() => {
      scrollToBottom()
      inputRef.value?.focus?.()
    })
    loadSessions()
    loadModels()
  }
}

// ── Drag ──
function startDragFab(e: MouseEvent) { startDrag(e, "fab") }
function startDragPanel(e: MouseEvent) { startDrag(e, "panel") }

function startDrag(e: MouseEvent, target: "fab" | "panel") {
  dragging = true
  didMove = false
  dragTarget = target
  dragStartX = e.clientX
  dragStartY = e.clientY
  const pos = target === "fab" ? fabPos.value : panelPos.value
  dragStartPosX = pos.x >= 0 ? pos.x : (target === "fab" ? window.innerWidth - 80 : window.innerWidth - panelSize.value.w - 24)
  dragStartPosY = pos.y >= 0 ? pos.y : (target === "fab" ? window.innerHeight - 80 : 60)
  e.preventDefault()
}

function startResize(e: MouseEvent) {
  resizing = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  resizeStartW = panelSize.value.w
  resizeStartH = panelSize.value.h
  e.preventDefault()
  e.stopPropagation()
}

function onMouseMove(e: MouseEvent) {
  if (resizing) {
    panelSize.value = {
      w: Math.max(340, Math.min(800, resizeStartW + e.clientX - dragStartX)),
      h: Math.max(400, Math.min(900, resizeStartH + e.clientY - dragStartY)),
    }
    return
  }
  if (!dragging) return
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMove = true
  const pos = dragTarget === "fab" ? fabPos : panelPos
  pos.value = {
    x: Math.max(0, Math.min(window.innerWidth - 60, dragStartPosX + dx)),
    y: Math.max(0, Math.min(window.innerHeight - 60, dragStartPosY + dy)),
  }
}

function onMouseUp() {
  if (resizing) { resizing = false; return }
  if (!dragging) return
  dragging = false
  setTimeout(() => { didMove = false }, 50)
}

// ── Session management ──
function setSessionIdValue(id: string | null) {
  sessionId.value = id
  if (id) localStorage.setItem(STORAGE_KEY_SESSION, id)
  else localStorage.removeItem(STORAGE_KEY_SESSION)
}

function newSession() {
  setSessionIdValue(null)
  messages.value = []
  sentHistory.value = []
  historyIndex = -1
  historyDraft = ""
}

async function loadSessions() {
  try {
    sessions.value = (await getAdminChatSessions()) as SessionItem[]
  } catch { /* ok */ }
}

async function loadModels() {
  if (models.value.length > 0) return
  try {
    models.value = await getAdminModels()
    if (models.value.length > 0) {
      const valid = models.value.some((m) => m.id === selectedModel.value)
      if (!valid) {
        selectedModel.value = models.value[0].id
      }
    }
  } catch { /* ok */ }
}

watch(selectedModel, (val) => {
  if (val) localStorage.setItem("admin_chat_model", val)
})

async function onSessionCommand(command: string) {
  if (command === "__new") {
    newSession()
    return
  }
  await switchToSession(command)
}

async function switchToSession(sid: string) {
  const cached = getCachedHistory(sid)
  if (cached.length > 0) {
    setSessionIdValue(sid)
    messages.value = cached
    sentHistory.value = cached.filter((m) => m.role === "user").map((m) => m.content)
    historyIndex = -1
    historyDraft = ""
    scrollToBottom()
    return
  }

  try {
    const detail = await getAdminChatSession(sid) as any
    if (detail) {
      setSessionIdValue(sid)
      messages.value = detail.messages
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({ role: m.role, content: m.content }))
      sentHistory.value = messages.value.filter((m) => m.role === "user").map((m) => m.content)
      historyIndex = -1
      historyDraft = ""
      setCachedHistory(sid, messages.value)
      scrollToBottom()
    }
  } catch { /* ok */ }
}

async function deleteSessionItem(id: string) {
  try {
    await deleteAdminChatSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
    removeCachedHistory(id)
    if (sessionId.value === id) newSession()
  } catch { /* ok */ }
}

// ── Rendering ──
function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>")
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, (match) => `<ul>${match}</ul>`)
  html = html.replace(/<\/ul>\s*<ul>/g, "")
  html = html.replace(/\n/g, "<br>")
  return html
}

// ── Input ──
function onInputKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
    return
  }
  if (e.key === "ArrowUp") {
    if (sentHistory.value.length === 0) return
    if (historyIndex === -1) {
      historyDraft = input.value
      historyIndex = sentHistory.value.length - 1
    } else if (historyIndex > 0) {
      historyIndex--
    }
    input.value = sentHistory.value[historyIndex]
    e.preventDefault()
    return
  }
  if (e.key === "ArrowDown") {
    if (historyIndex === -1) return
    if (historyIndex < sentHistory.value.length - 1) {
      historyIndex++
      input.value = sentHistory.value[historyIndex]
    } else {
      historyIndex = -1
      input.value = historyDraft
    }
    e.preventDefault()
    return
  }
  if (e.key === "Escape") {
    open.value = false
  }
}

function stopStreaming() {
  activeController?.abort()
  activeController = null
  if (streamBuffer.value) {
    messages.value.push({ role: "assistant", content: streamBuffer.value })
  }
  streamBuffer.value = ""
  streaming.value = false
  if (sessionId.value) setCachedHistory(sessionId.value, messages.value)
}

async function sendMessage(text?: string) {
  const msg = text ?? input.value.trim()
  if (!msg || streaming.value) return

  sentHistory.value.push(msg)
  historyIndex = -1
  historyDraft = ""

  const contextMsg = `[当前页面: ${currentPageLabel.value}] ${msg}`

  messages.value.push({ role: "user", content: msg })
  input.value = ""
  streaming.value = true
  streamBuffer.value = ""
  scrollToBottom()

  const history = sessionId.value
    ? []
    : messages.value.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))

  activeController = streamAdminChat(
    contextMsg,
    history,
    (chunk) => {
      streamBuffer.value += chunk
      scrollToBottom()
    },
    () => {
      if (streamBuffer.value) {
        messages.value.push({ role: "assistant", content: streamBuffer.value })
      }
      streamBuffer.value = ""
      streaming.value = false
      activeController = null
      scrollToBottom()
      if (sessionId.value) setCachedHistory(sessionId.value, messages.value)
      loadSessions()
    },
    (errMsg) => {
      messages.value.push({ role: "assistant", content: `错误: ${errMsg}` })
      streamBuffer.value = ""
      streaming.value = false
      activeController = null
      scrollToBottom()
      if (sessionId.value) setCachedHistory(sessionId.value, messages.value)
    },
    sessionId.value ?? undefined,
    (id) => {
      setSessionIdValue(id)
    },
    selectedModel.value || undefined,
  )
}

// ── Lifecycle ──
onMounted(async () => {
  document.addEventListener("mousemove", onMouseMove)
  document.addEventListener("mouseup", onMouseUp)

  if (sessionId.value) {
    const cached = getCachedHistory(sessionId.value)
    if (cached.length > 0) {
      messages.value = cached
      sentHistory.value = cached.filter((m) => m.role === "user").map((m) => m.content)
    } else {
      try {
        const detail = await getAdminChatSession(sessionId.value) as any
        if (detail) {
          messages.value = detail.messages
            .filter((m: any) => m.role === "user" || m.role === "assistant")
            .map((m: any) => ({ role: m.role, content: m.content }))
          sentHistory.value = messages.value.filter((m) => m.role === "user").map((m) => m.content)
          setCachedHistory(sessionId.value, messages.value)
        } else {
          setSessionIdValue(null)
        }
      } catch {
        setSessionIdValue(null)
      }
    }
  }
})

onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove)
  document.removeEventListener("mouseup", onMouseUp)
})
</script>

<style scoped>
.ai-fab {
  position: fixed;
  z-index: 9999;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
  transition: box-shadow 0.2s, transform 0.2s;
  user-select: none;
}

.ai-fab:hover {
  box-shadow: 0 6px 24px rgba(102, 126, 234, 0.6);
  transform: scale(1.05);
}

.ai-panel {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 340px;
  min-height: 400px;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #f8f9ff 0%, #f0f2ff 100%);
  border-bottom: 1px solid #e4e7ed;
  cursor: move;
  user-select: none;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.header-btn {
  padding: 4px !important;
  min-height: auto !important;
  color: #606266;
}

.header-btn:hover {
  color: #409eff;
}

.current-session-label {
  font-size: 11px;
  margin-left: 4px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #909399;
}

.panel-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background: #fafbfc;
}

.welcome {
  text-align: center;
  color: #606266;
  font-size: 13px;
  padding: 24px 12px 16px;
}

.welcome-icon {
  margin-bottom: 8px;
}

.welcome p {
  margin: 0 0 12px;
  line-height: 1.5;
}

.quick-btns {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}

.message {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: flex-start;
}

.message.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message.user .avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.message.assistant .avatar {
  background: #e8eaed;
  color: #606266;
}

.bubble {
  max-width: 82%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
}

.message.user .bubble {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-top-right-radius: 2px;
}

.message.assistant .bubble {
  background: #fff;
  color: #303133;
  border-top-left-radius: 2px;
  border: 1px solid #ebeef5;
}

.bubble-content :deep(.code-block) {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 11px;
  margin: 6px 0;
}

.bubble-content :deep(.inline-code) {
  background: #e8eaed;
  padding: 1px 3px;
  border-radius: 2px;
  font-size: 12px;
}

.bubble-content :deep(strong) {
  font-weight: 600;
}

.bubble-content :deep(ul) {
  margin: 4px 0;
  padding-left: 16px;
}

.bubble-content :deep(li) {
  margin: 2px 0;
}

.cursor-blink {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: #409eff;
  margin-left: 1px;
  vertical-align: middle;
  animation: blink 0.8s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.thinking {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
}

.thinking .dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c0c4cc;
  animation: bounce 1.2s infinite ease-in-out;
}

.thinking .dot:nth-child(1) {
  animation-delay: 0s;
}

.thinking .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bounce {

  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.4;
  }

  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.panel-input {
  padding: 10px 12px;
  border-top: 1px solid #e4e7ed;
  background: #fff;
}

.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, #c0c4cc 50%, #c0c4cc 60%, transparent 60%, transparent 75%, #c0c4cc 75%, #c0c4cc 85%, transparent 85%);
  opacity: 0.5;
  border-radius: 0 0 12px 0;
}

.resize-handle:hover {
  opacity: 1;
}

/* Session dropdown */
.session-row {
  display: flex;
  align-items: center;
  width: 200px;
}

.session-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.session-del {
  color: #c0c4cc;
  margin-left: 6px;
  flex-shrink: 0;
  cursor: pointer;
}

.session-del:hover {
  color: #f56c6c;
}

.active-session {
  background: #ecf5ff;
}

/* Model selector in input */
.input-row {
  display: flex;
  gap: 6px;
  align-items: stretch;
}

.input-row .el-input {
  flex: 1;
}

.model-selector-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #f5f7fa;
  font-size: 11px;
  color: #606266;
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
  height: 100%;
}

.model-selector-btn:hover {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}

.model-selector-label {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
}

.model-option-left {
  flex: 1;
  min-width: 0;
}

.model-option-name {
  font-size: 12px;
  display: block;
}

.model-option-desc {
  font-size: 10px;
  color: #909399;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active-model {
  background: #ecf5ff;
}
</style>

<style>
.ai-dropdown-menu {
  z-index: 90001 !important;
}
</style>
