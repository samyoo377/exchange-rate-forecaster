<template>
  <div class="assistant-page">
    <div class="page-header">
      <h2 class="page-title">AI 助手 <el-tag size="small" type="info">Claude Sonnet 4.6</el-tag></h2>
      <div class="header-actions">
        <el-button size="small" @click="newSession">新建对话</el-button>
        <el-dropdown trigger="click" @command="switchSession" v-if="sessions.length > 0">
          <el-button size="small">历史会话 <el-icon><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="s in sessions"
                :key="s.id"
                :command="s.id"
              >
                <div class="session-row">
                  <span class="session-label">{{ s.title || '未命名' }}</span>
                  <el-icon class="session-del" @click.stop="removeSession(s.id)"><Close /></el-icon>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="chat-container">
      <!-- Messages -->
      <div class="messages" ref="messagesRef">
        <div class="welcome" v-if="messages.length === 0">
          <el-icon :size="40" color="#409eff"><ChatLineSquare /></el-icon>
          <h3>你好，我是管理后台 AI 助手</h3>
          <p>我可以帮你查询数据库、分析系统状态、排查问题。试试下面的快捷问题：</p>
          <div class="quick-questions">
            <el-button
              v-for="q in quickQuestions"
              :key="q"
              size="small"
              round
              @click="sendMessage(q)"
            >{{ q }}</el-button>
          </div>
        </div>

        <div
          v-for="(msg, i) in messages"
          :key="i"
          :class="['message', msg.role]"
        >
          <div class="avatar">
            <el-icon v-if="msg.role === 'assistant'" :size="20"><Monitor /></el-icon>
            <el-icon v-else :size="20"><User /></el-icon>
          </div>
          <div class="bubble">
            <div class="bubble-content" v-html="renderMarkdown(msg.content)" />
          </div>
        </div>

        <!-- Streaming indicator -->
        <div v-if="streaming" class="message assistant">
          <div class="avatar"><el-icon :size="20"><Monitor /></el-icon></div>
          <div class="bubble">
            <div class="bubble-content">
              {{ streamBuffer }}
              <span class="cursor-blink">|</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="input-area">
        <el-input
          v-model="input"
          placeholder="输入问题，如：最近有多少条新闻？预测结果准确率如何？"
          @keyup.enter="sendMessage()"
          :disabled="streaming"
          size="large"
        >
          <template #append>
            <el-button
              type="primary"
              @click="sendMessage()"
              :loading="streaming"
              :disabled="!input.trim()"
            >
              发送
            </el-button>
          </template>
        </el-input>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from "vue"
import {
  streamAdminChat, getAdminChatSessions, getAdminChatSession,
  deleteAdminChatSession, type AdminChatSession,
} from "../api/index"

interface ChatMsg {
  role: "user" | "assistant"
  content: string
}

const ADMIN_SESSION_KEY = "admin_chat_session_id"

const messages = ref<ChatMsg[]>([])
const input = ref("")
const streaming = ref(false)
const streamBuffer = ref("")
const messagesRef = ref<HTMLElement | null>(null)
const sessionId = ref<string | null>(localStorage.getItem(ADMIN_SESSION_KEY))
const sessions = ref<AdminChatSession[]>([])

const quickQuestions = [
  "数据库各表有多少条数据？",
  "最近的新闻消化摘要是什么？",
  "最近5条预测结果是什么？",
  "有哪些失败的任务日志？",
  "新闻来源分布情况如何？",
]

function setSessionId(id: string | null) {
  sessionId.value = id
  if (id) localStorage.setItem(ADMIN_SESSION_KEY, id)
  else localStorage.removeItem(ADMIN_SESSION_KEY)
}

onMounted(async () => {
  await loadSessions()
  if (sessionId.value) {
    await loadSession(sessionId.value)
  }
})

async function loadSessions() {
  try {
    sessions.value = await getAdminChatSessions()
  } catch {
    // non-critical
  }
}

async function loadSession(id: string) {
  try {
    const detail = await getAdminChatSession(id) as any
    if (!detail) {
      setSessionId(null)
      messages.value = []
      return
    }
    setSessionId(id)
    messages.value = detail.messages
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role, content: m.content }))
    scrollToBottom()
  } catch {
    setSessionId(null)
    messages.value = []
  }
}

function newSession() {
  setSessionId(null)
  messages.value = []
}

function switchSession(id: string) {
  loadSession(id)
}

async function removeSession(id: string) {
  try {
    await deleteAdminChatSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (sessionId.value === id) {
      newSession()
    }
  } catch {
    // ignore
  }
}

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
  html = html.replace(/\n/g, "<br>")

  return html
}

async function sendMessage(text?: string) {
  const msg = text ?? input.value.trim()
  if (!msg) return

  messages.value.push({ role: "user", content: msg })
  input.value = ""
  streaming.value = true
  streamBuffer.value = ""
  scrollToBottom()

  const history = sessionId.value
    ? []
    : messages.value.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))

  streamAdminChat(
    msg,
    history,
    (chunk) => {
      streamBuffer.value += chunk
      scrollToBottom()
    },
    () => {
      messages.value.push({ role: "assistant", content: streamBuffer.value })
      streamBuffer.value = ""
      streaming.value = false
      scrollToBottom()
      loadSessions()
    },
    (err) => {
      messages.value.push({ role: "assistant", content: `错误: ${err}` })
      streamBuffer.value = ""
      streaming.value = false
      scrollToBottom()
    },
    sessionId.value ?? undefined,
    (id) => {
      setSessionId(id)
    },
  )
}
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.header-actions { display: flex; gap: 8px; }

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 200px;
}
.session-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.session-del {
  color: #909399;
  font-size: 12px;
  margin-left: 8px;
}
.session-del:hover { color: #f56c6c; }

.chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.welcome {
  text-align: center;
  padding: 40px 20px;
  color: #606266;
}
.welcome h3 { margin: 12px 0 8px; color: #303133; }
.welcome p { font-size: 14px; margin-bottom: 16px; }
.quick-questions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }

.message {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  align-items: flex-start;
}

.message.user { flex-direction: row-reverse; }

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message.user .avatar { background: #409eff; color: #fff; }
.message.assistant .avatar { background: #f0f2f5; color: #606266; }

.bubble {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
}

.message.user .bubble { background: #409eff; color: #fff; border-top-right-radius: 2px; }
.message.assistant .bubble { background: #f5f7fa; color: #303133; border-top-left-radius: 2px; }

.bubble-content :deep(.code-block) {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 10px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
  margin: 8px 0;
}

.bubble-content :deep(.inline-code) {
  background: #e8eaed;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 13px;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
}
@keyframes blink { 50% { opacity: 0; } }

.input-area {
  padding: 12px 20px;
  border-top: 1px solid #ebeef5;
  background: #fafbfc;
}
</style>
