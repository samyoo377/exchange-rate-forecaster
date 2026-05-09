<template>
  <div class="assistant-page">
    <div class="chat-container">
      <!-- Header -->
      <div class="chat-header">
        <div class="header-left">
          <div class="ai-avatar-sm">AI</div>
          <div class="header-info">
            <span class="header-title">AI 助手</span>
            <el-tag size="small" type="info" effect="plain">Claude Sonnet 4.6</el-tag>
          </div>
        </div>
        <div class="header-actions">
          <el-button size="small" text @click="newSession">
            <el-icon><Plus /></el-icon> 新对话
          </el-button>
          <el-dropdown trigger="click" @command="switchSession" v-if="sessions.length > 0">
            <el-button size="small" text>
              <el-icon><Clock /></el-icon> 历史
            </el-button>
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

      <!-- Messages -->
      <div class="messages" ref="messagesRef">
        <div class="welcome" v-if="messages.length === 0 && !streaming">
          <div class="welcome-avatar">AI</div>
          <div class="welcome-title">你好，我是管理后台 AI 助手</div>
          <div class="welcome-desc">
            我可以帮你查询数据库、分析系统状态、排查问题。试试问我：
          </div>
          <div class="welcome-suggestions">
            <button
              v-for="q in quickQuestions"
              :key="q"
              class="suggestion-btn"
              @click="sendMessage(q)"
            >{{ q }}</button>
          </div>
        </div>

        <template v-for="(msg, i) in messages" :key="i">
          <div :class="['msg-row', msg.role]">
            <div class="msg-avatar" v-if="msg.role === 'assistant'">AI</div>
            <div class="msg-body">
              <!-- Attachments -->
              <div v-if="msg.attachments?.length" class="msg-attachments">
                <div
                  v-for="att in msg.attachments"
                  :key="att.id"
                  class="att-item"
                  @click="att.mimeType.startsWith('image/') && previewImage(att.localUrl || `/uploads/${att.storedPath}`)"
                >
                  <img
                    v-if="att.mimeType.startsWith('image/')"
                    :src="att.localUrl || `/uploads/${att.storedPath}`"
                    :alt="att.originalName"
                    class="att-img"
                  />
                  <div v-else class="att-file">
                    <el-icon><Document /></el-icon>
                    <span>{{ att.originalName }}</span>
                  </div>
                </div>
              </div>
              <div class="msg-bubble">
                <div class="bubble-content" v-html="renderMarkdown(msg.content)" />
              </div>
              <div class="msg-actions" v-if="msg.role === 'assistant'">
                <button class="action-btn" @click="copyText(msg.content)" title="复制">
                  <el-icon><CopyDocument /></el-icon>
                </button>
              </div>
            </div>
            <div class="msg-avatar user-avatar" v-if="msg.role === 'user'">
              <el-icon :size="14"><User /></el-icon>
            </div>
          </div>
        </template>

        <!-- Streaming -->
        <div v-if="streaming" class="msg-row assistant">
          <div class="msg-avatar">AI</div>
          <div class="msg-body">
            <div class="msg-bubble">
              <div class="bubble-content" v-if="streamBuffer" v-html="renderMarkdown(streamBuffer)" />
              <div class="thinking-indicator" v-else>
                <span class="thinking-dot" /><span class="thinking-dot" /><span class="thinking-dot" />
                <span class="thinking-text">思考中...</span>
              </div>
              <span v-if="streamBuffer" class="streaming-cursor" />
            </div>
          </div>
        </div>
      </div>

      <!-- Pending Attachments -->
      <div v-if="pendingFiles.length" class="pending-bar">
        <div v-for="(f, i) in pendingFiles" :key="i" class="pending-item">
          <img v-if="f.mimeType.startsWith('image/')" :src="f.localUrl || `/uploads/${f.storedPath}`" class="pending-thumb" />
          <div v-else class="pending-file-chip">
            <el-icon><Document /></el-icon>
            <span>{{ f.originalName }}</span>
          </div>
          <button class="pending-remove" @click="removePending(i)">
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </div>

      <!-- Input -->
      <div class="input-area">
        <div class="input-row">
          <button class="upload-btn" @click="triggerUpload" :disabled="streaming" title="上传文件">
            <el-icon><Paperclip /></el-icon>
          </button>
          <input ref="fileInputRef" type="file" multiple hidden @change="handleFileSelect" accept="image/*,.pdf,.txt,.csv,.json,.xlsx,.xls" />
          <div class="input-wrapper">
            <el-input
              v-model="input"
              placeholder="输入问题..."
              @keyup.enter="sendMessage()"
              :disabled="streaming"
              size="large"
            />
          </div>
          <el-button
            v-if="streaming"
            type="danger"
            circle
            size="default"
            @click="stopStream"
          >
            <el-icon><VideoPause /></el-icon>
          </el-button>
          <el-button
            v-else
            type="primary"
            circle
            size="default"
            @click="sendMessage()"
            :disabled="!input.trim() && !pendingFiles.length"
          >
            <el-icon><Promotion /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- Image Preview Overlay -->
    <Teleport to="body">
      <div v-if="previewSrc" class="image-overlay" @click="previewSrc = ''">
        <img :src="previewSrc" class="preview-full" @click.stop />
        <button class="preview-close" @click="previewSrc = ''">
          <el-icon :size="20"><Close /></el-icon>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from "vue"
import {
  streamAdminChat, getAdminChatSessions, getAdminChatSession,
  deleteAdminChatSession, uploadFile,
  type AdminChatSession, type UploadedFileInfo,
} from "../api/index"
import { warmUrlCache, getFileUrl } from "../utils/fileCache"
import { ElMessage } from "element-plus"
import { Document, Paperclip } from "@element-plus/icons-vue"

interface ChatMsg {
  role: "user" | "assistant"
  content: string
  attachments?: UploadedFileInfo[]
}

const ADMIN_SESSION_KEY = "admin_chat_session_id"

const messages = ref<ChatMsg[]>([])
const input = ref("")
const streaming = ref(false)
const streamBuffer = ref("")
const messagesRef = ref<HTMLElement | null>(null)
const sessionId = ref<string | null>(localStorage.getItem(ADMIN_SESSION_KEY))
const sessions = ref<AdminChatSession[]>([])
const pendingFiles = ref<UploadedFileInfo[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const previewSrc = ref("")

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

    const allAttachmentIds = detail.messages
      .flatMap((m: any) => m.attachments ?? [])
      .map((a: any) => a.id)
    if (allAttachmentIds.length > 0) {
      await warmUrlCache(allAttachmentIds)
    }

    messages.value = await Promise.all(
      detail.messages
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map(async (m: any) => {
          const attachments = m.attachments?.length
            ? await Promise.all(
                m.attachments.map(async (a: any) => ({
                  ...a,
                  localUrl: (await getFileUrl(a.id)) ?? undefined,
                })),
              )
            : undefined
          return {
            role: m.role,
            content: m.content,
            attachments,
          }
        }),
    )
    scrollToBottom()
  } catch {
    setSessionId(null)
    messages.value = []
  }
}

function newSession() {
  setSessionId(null)
  messages.value = []
  pendingFiles.value = []
}

function switchSession(id: string) {
  loadSession(id)
}

async function removeSession(id: string) {
  try {
    await deleteAdminChatSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (sessionId.value === id) newSession()
  } catch {
    // ignore
  }
}

function stopStream() {
  streaming.value = false
  if (streamBuffer.value) {
    messages.value.push({ role: "assistant", content: streamBuffer.value })
    streamBuffer.value = ""
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  })
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success("已复制")
  } catch {
    ElMessage.error("复制失败")
  }
}

function previewImage(src: string) {
  previewSrc.value = src
}

function triggerUpload() {
  fileInputRef.value?.click()
}

async function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (!files?.length) return

  for (const file of Array.from(files)) {
    try {
      const info = await uploadFile(file)
      pendingFiles.value.push(info)
    } catch (err) {
      ElMessage.error(`上传失败: ${(err as Error).message}`)
    }
  }
  target.value = ""
}

function removePending(index: number) {
  pendingFiles.value.splice(index, 1)
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
  if (!msg && !pendingFiles.value.length) return

  const attachments = pendingFiles.value.length ? [...pendingFiles.value] : undefined
  const attachmentIds = attachments?.map((a) => a.id)

  messages.value.push({ role: "user", content: msg || "(附件)", attachments })
  input.value = ""
  pendingFiles.value = []
  streaming.value = true
  streamBuffer.value = ""
  scrollToBottom()

  const history = sessionId.value
    ? []
    : messages.value.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))

  streamAdminChat(
    msg || "请分析上传的文件内容",
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
    (id) => { setSessionId(id) },
    undefined,
    attachmentIds,
  )
}
</script>

<style scoped>
.assistant-page { height: calc(100vh - 80px); }

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

/* Header */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #f1f5f9;
}
.header-left { display: flex; align-items: center; gap: 12px; }
.ai-avatar-sm {
  width: 32px; height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.header-info { display: flex; align-items: center; gap: 8px; }
.header-title { font-size: 15px; font-weight: 600; color: #1e293b; }
.header-actions { display: flex; gap: 4px; }

/* Messages */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Welcome */
.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  padding: 40px 20px;
}
.welcome-avatar {
  width: 48px; height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}
.welcome-title { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 8px; }
.welcome-desc { font-size: 13px; color: #64748b; margin-bottom: 20px; max-width: 360px; line-height: 1.6; }
.welcome-suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.suggestion-btn {
  padding: 8px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #fff;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}
.suggestion-btn:hover { border-color: #2563eb; color: #2563eb; background: #eff6ff; }

/* Message rows */
.msg-row { display: flex; gap: 12px; align-items: flex-start; }
.msg-row.user { flex-direction: row-reverse; }
.msg-avatar {
  width: 32px; height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.msg-avatar.user-avatar { background: linear-gradient(135deg, #0ea5e9, #06b6d4); }
.msg-body { max-width: 78%; min-width: 0; }

/* Attachments */
.msg-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.att-item { cursor: pointer; }
.att-img {
  width: 120px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.att-file {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: #f1f5f9;
  border-radius: 6px;
  font-size: 11px;
  color: #475569;
}

/* Bubble */
.msg-bubble {
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}
.msg-row.assistant .msg-bubble {
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 2px 12px 12px 12px;
}
.msg-row.user .msg-bubble {
  background: #2563eb;
  color: #fff;
  border-radius: 12px 2px 12px 12px;
}

.bubble-content :deep(.code-block) {
  background: #1e293b;
  color: #e2e8f0;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 12px;
  margin: 8px 0;
  font-family: "JetBrains Mono", monospace;
}
.bubble-content :deep(.inline-code) {
  background: #e2e8f0;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12px;
  font-family: "JetBrains Mono", monospace;
}
.bubble-content :deep(strong) { font-weight: 600; }
.msg-row.user .bubble-content :deep(.inline-code) { background: rgba(255,255,255,0.2); color: #fff; }

/* Actions */
.msg-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  opacity: 0;
  transition: opacity 0.2s;
}
.msg-row:hover .msg-actions { opacity: 1; }
.action-btn {
  width: 26px; height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.action-btn:hover { background: #f1f5f9; color: #475569; }

/* Thinking */
.thinking-indicator { display: flex; align-items: center; gap: 6px; }
.thinking-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #94a3b8;
  animation: bounce 1.2s infinite ease-in-out;
}
.thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.thinking-dot:nth-child(3) { animation-delay: 0.4s; }
.thinking-text { font-size: 12px; color: #94a3b8; margin-left: 4px; }
@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* Streaming cursor */
.streaming-cursor {
  display: inline-block;
  width: 2px; height: 14px;
  background: #2563eb;
  margin-left: 2px;
  vertical-align: middle;
  animation: blink 0.8s infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* Pending attachments bar */
.pending-bar {
  display: flex;
  gap: 8px;
  padding: 8px 20px;
  border-top: 1px solid #f1f5f9;
  flex-wrap: wrap;
}
.pending-item {
  position: relative;
  display: inline-flex;
}
.pending-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}
.pending-file-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: #f1f5f9;
  border-radius: 6px;
  font-size: 11px;
  color: #475569;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pending-remove {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ef4444;
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

/* Input */
.input-area {
  padding: 14px 20px;
  border-top: 1px solid #f1f5f9;
}
.input-row { display: flex; align-items: center; gap: 10px; }
.upload-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  font-size: 18px;
}
.upload-btn:hover { background: #f1f5f9; color: #475569; }
.upload-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.input-wrapper { flex: 1; }
.input-wrapper :deep(.el-input__wrapper) {
  border-radius: 20px;
  padding: 4px 16px;
  box-shadow: 0 0 0 1px #e2e8f0;
}
.input-wrapper :deep(.el-input__wrapper:focus-within) {
  box-shadow: 0 0 0 2px #2563eb;
}

/* Session dropdown */
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
.session-del { color: #94a3b8; font-size: 12px; margin-left: 8px; }
.session-del:hover { color: #ef4444; }

/* Image preview overlay */
.image-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.preview-full {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 8px;
}
.preview-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
