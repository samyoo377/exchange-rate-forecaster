<template>
  <div class="chat-panel">
    <div class="chat-header">
      <div class="chat-header-left">
        <div class="ai-avatar-sm">AI</div>
        <span class="chat-title-text">AI 预测问答</span>
        <span class="chat-context-badge" v-if="!predStore.loading">
          <span class="badge-dot" />实时行情已接入
        </span>
      </div>
      <el-dropdown trigger="click" @command="onSessionCommand">
        <el-button size="small" text>
          <el-icon><More /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="new">新建对话</el-dropdown-item>
            <el-dropdown-item divided v-if="predStore.sessions.length > 0" disabled>
              历史会话
            </el-dropdown-item>
            <el-dropdown-item
              v-for="s in predStore.sessions.slice(0, 10)"
              :key="s.id"
              :command="s.id"
            >
              <div class="session-item">
                <span class="session-title">{{ s.title || '未命名' }}</span>
                <el-icon class="session-delete" @click.stop="deleteSession(s.id)"><Close /></el-icon>
              </div>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div class="chat-messages" ref="msgContainer">
      <!-- Welcome state -->
      <div v-if="predStore.messages.length === 0" class="welcome-state">
        <div class="welcome-avatar">AI</div>
        <div class="welcome-title">你好，我是 AI 分析师</div>
        <div class="welcome-desc">
          我可以结合实时行情、技术指标和消息面为你分析 USDCNH 走势。试试问我：
        </div>
        <div class="welcome-suggestions">
          <button
            v-for="q in quickQuestions"
            :key="q"
            class="suggestion-btn"
            @click="sendQuick(q)"
          >{{ q }}</button>
        </div>
      </div>

      <!-- Messages -->
      <template v-for="(msg, i) in predStore.messages" :key="i">
        <div :class="['msg-row', msg.role]">
          <div class="msg-avatar" v-if="msg.role === 'assistant'">AI</div>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="msg-sender">{{ msg.role === 'user' ? '你' : 'AI 分析师' }}</span>
              <span class="msg-time" v-if="msg.timestamp">{{ formatTime(msg.timestamp) }}</span>
            </div>
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
            <div class="msg-bubble" :class="{ streaming: msg.streaming }">
              <div class="bubble-content" v-html="renderMarkdown(msg.content)" />
              <span v-if="msg.streaming && msg.content" class="streaming-cursor" />
            </div>
            <PredictionDetail v-if="msg.prediction" :prediction="msg.prediction" />
            <!-- Actions -->
            <div class="msg-actions" v-if="msg.role === 'assistant' && msg.content && !msg.streaming">
              <button class="action-btn" @click="copyMessage(msg.content)" title="复制">
                <el-icon><CopyDocument /></el-icon>
              </button>
            </div>
          </div>
          <div class="msg-avatar user-avatar" v-if="msg.role === 'user'">你</div>
        </div>
      </template>

      <!-- Thinking -->
      <div v-if="predStore.thinking" class="msg-row assistant">
        <div class="msg-avatar">AI</div>
        <div class="msg-body">
          <div class="msg-bubble">
            <div class="thinking-indicator">
              <span class="thinking-dot" /><span class="thinking-dot" /><span class="thinking-dot" />
              <span class="thinking-text">正在分析...</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pending attachments -->
    <div v-if="predStore.pendingAttachments.length > 0" class="pending-bar">
      <div
        v-for="att in predStore.pendingAttachments"
        :key="att.id"
        class="pending-chip"
      >
        <img
          v-if="att.mimeType.startsWith('image/')"
          :src="att.localUrl || `/uploads/${att.storedPath}`"
          class="pending-thumb"
          @click="previewImage(att.localUrl || `/uploads/${att.storedPath}`)"
        />
        <span v-else class="pending-name">{{ att.originalName }}</span>
        <el-icon class="pending-close" @click="predStore.removeAttachment(att.id)"><Close /></el-icon>
      </div>
    </div>

    <!-- Input area -->
    <div class="input-area">
      <div class="input-row">
        <label class="upload-btn" :class="{ disabled: predStore.loading || uploading }">
          <el-icon size="18"><Paperclip /></el-icon>
          <input
            type="file"
            multiple
            accept="image/*,.txt,.json,.csv,.pdf,.xlsx,.xls"
            @change="handleFileSelect"
            :disabled="predStore.loading || uploading"
            style="display:none"
          />
        </label>
        <div class="input-wrapper">
          <el-input
            v-model="question"
            :placeholder="inputPlaceholder"
            @keydown="onInputKeydown"
            :disabled="predStore.loading"
            clearable
            size="large"
          />
        </div>
        <el-select v-model="horizon" size="small" class="horizon-select">
          <el-option label="T+1" value="T+1" />
          <el-option label="T+2" value="T+2" />
          <el-option label="T+3" value="T+3" />
        </el-select>
        <el-button
          v-if="predStore.loading"
          type="danger"
          size="default"
          circle
          @click="predStore.stopStreaming()"
          class="send-btn"
        >
          <el-icon><VideoPause /></el-icon>
        </el-button>
        <el-button
          v-else
          type="primary"
          size="default"
          circle
          @click="send"
          :disabled="!question.trim() && !predStore.pendingAttachments.length"
          class="send-btn"
        >
          <el-icon><Promotion /></el-icon>
        </el-button>
      </div>
      <!-- Quick questions (only show when there are messages) -->
      <div class="quick-row" v-if="predStore.messages.length > 0">
        <button
          v-for="q in quickQuestions"
          :key="q"
          class="quick-chip"
          :disabled="predStore.loading"
          @click="sendQuick(q)"
        >{{ q }}</button>
      </div>
    </div>

    <!-- Image preview overlay -->
    <Teleport to="body">
      <div v-if="previewSrc" class="image-preview-overlay" @click="previewSrc = ''">
        <img :src="previewSrc" class="preview-full-img" @click.stop />
        <button class="preview-close" @click="previewSrc = ''">&times;</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from "vue"
import { usePredictionStore } from "../stores/prediction"
import { uploadFile } from "../api/index"
import PredictionDetail from "./PredictionDetail.vue"
import { ElMessage } from "element-plus"

const predStore = usePredictionStore()
const question = ref("")
const horizon = ref("T+2")
const msgContainer = ref<HTMLElement>()
const uploading = ref(false)
const previewSrc = ref("")

const sentHistory = ref<string[]>([])
let historyIndex = -1
let historyDraft = ""

const inputPlaceholder = "输入你的问题... (↑↓ 翻阅历史)"

const quickQuestions = [
  "未来T+2偏升还是偏贬？",
  "当前趋势强度如何？",
  "RSI和MACD信号怎么看？",
  "综合分析一下当前行情",
]

onMounted(async () => {
  predStore.fetchNewsDigest()
  await predStore.loadSessions()
  if (predStore.sessionId) {
    await predStore.loadSession(predStore.sessionId)
    scrollToBottom()
  }
})

function previewImage(src: string) {
  previewSrc.value = src
}

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  input.value = ""
  uploading.value = true
  try {
    for (const file of Array.from(files)) {
      const result = await uploadFile(file)
      predStore.addAttachment(result)
    }
  } catch (err) {
    ElMessage.error("文件上传失败")
  } finally {
    uploading.value = false
  }
}

function onSessionCommand(command: string) {
  if (command === "new") {
    predStore.newSession()
  } else {
    predStore.loadSession(command)
  }
}

async function deleteSession(id: string) {
  await predStore.removeSession(id)
}

async function send() {
  const q = question.value.trim()
  if (!q && !predStore.pendingAttachments.length) return
  if (q) {
    sentHistory.value.push(q)
    historyIndex = -1
    historyDraft = ""
  }
  question.value = ""
  await predStore.askAI(q || "请分析上传的文件内容", "USDCNH", horizon.value)
  scrollToBottom()
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    send()
    return
  }
  if (e.key === "ArrowUp") {
    if (sentHistory.value.length === 0) return
    if (historyIndex === -1) {
      historyDraft = question.value
      historyIndex = sentHistory.value.length - 1
    } else if (historyIndex > 0) {
      historyIndex--
    }
    question.value = sentHistory.value[historyIndex]
    e.preventDefault()
    return
  }
  if (e.key === "ArrowDown") {
    if (historyIndex === -1) return
    if (historyIndex < sentHistory.value.length - 1) {
      historyIndex++
      question.value = sentHistory.value[historyIndex]
    } else {
      historyIndex = -1
      question.value = historyDraft
    }
    e.preventDefault()
  }
}

function sendQuick(q: string) {
  question.value = q
  send()
}

async function copyMessage(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success("已复制")
  } catch {
    ElMessage.error("复制失败")
  }
}

function retryMessage(idx: number) {
  const userMsg = predStore.messages.slice(0, idx).reverse().find(m => m.role === "user")
  if (userMsg) {
    question.value = userMsg.content
    send()
  }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function renderMarkdown(text: string): string {
  if (!text) return ""
  let html = escapeHtml(text)
  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>")
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>")
  html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>")
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>")
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")
  html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>")
  html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
  html = html.replace(/^---$/gm, "<hr>")
  html = html.replace(/\n\n/g, "</p><p>")
  html = html.replace(/\n/g, "<br>")
  html = `<p>${html}</p>`
  html = html.replace(/<p>(<h[2-4]>)/g, "$1")
  html = html.replace(/(<\/h[2-4]>)<\/p>/g, "$1")
  html = html.replace(/<p>(<ul>)/g, "$1")
  html = html.replace(/(<\/ul>)<\/p>/g, "$1")
  html = html.replace(/<p>(<hr>)<\/p>/g, "$1")
  html = html.replace(/<p><\/p>/g, "")
  return html
}

function scrollToBottom() {
  nextTick(() => {
    if (msgContainer.value)
      msgContainer.value.scrollTop = msgContainer.value.scrollHeight
  })
}

watch(() => predStore.messages.length, scrollToBottom)
watch(() => predStore.messages[predStore.messages.length - 1]?.content, scrollToBottom)
watch(() => predStore.thinking, scrollToBottom)
</script>

<style scoped>
.chat-panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  height: 700px;
  overflow: hidden;
}

/* Header */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #f1f5f9;
}
.chat-header-left { display: flex; align-items: center; gap: 10px; }
.ai-avatar-sm {
  width: 28px; height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chat-title-text { font-size: 14px; font-weight: 600; color: #1e293b; }
.chat-context-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #16a34a;
  background: #f0fdf4;
  padding: 2px 8px;
  border-radius: 10px;
}
.badge-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #16a34a;
  animation: pulse-dot 2s infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Messages area */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Welcome state */
.welcome-state {
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
.welcome-desc { font-size: 13px; color: #64748b; margin-bottom: 20px; max-width: 320px; line-height: 1.6; }
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
.msg-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
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
.msg-avatar.user-avatar {
  background: linear-gradient(135deg, #0ea5e9, #06b6d4);
}
.msg-body { max-width: 80%; min-width: 0; }
.msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.msg-row.user .msg-meta { flex-direction: row-reverse; }
.msg-sender { font-size: 12px; font-weight: 500; color: #64748b; }
.msg-time { font-size: 11px; color: #94a3b8; }

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
.msg-row.user .msg-bubble :deep(code) { background: rgba(255,255,255,0.2); color: #fff; }

/* Bubble content */
.bubble-content :deep(h2),
.bubble-content :deep(h3),
.bubble-content :deep(h4) {
  margin: 8px 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}
.bubble-content :deep(ul) { margin: 4px 0; padding-left: 18px; }
.bubble-content :deep(li) { margin: 3px 0; }
.bubble-content :deep(code) {
  background: #e2e8f0;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
}
.bubble-content :deep(strong) { font-weight: 600; color: #1e293b; }
.bubble-content :deep(hr) { border: none; border-top: 1px solid #e2e8f0; margin: 8px 0; }
.bubble-content :deep(p) { margin: 0 0 6px; }
.bubble-content :deep(p:last-child) { margin-bottom: 0; }

/* Streaming cursor */
.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: #2563eb;
  margin-left: 2px;
  vertical-align: middle;
  animation: blink 0.8s infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* Thinking */
.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}
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

/* Message actions */
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

/* Attachments in messages */
.msg-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.att-item { cursor: pointer; }
.att-img {
  max-width: 180px;
  max-height: 120px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid #e2e8f0;
  transition: transform 0.2s;
}
.att-img:hover { transform: scale(1.02); }
.att-file {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 12px;
  color: #475569;
}

/* Pending attachments */
.pending-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 18px;
  border-top: 1px solid #f1f5f9;
}
.pending-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 4px 8px;
}
.pending-thumb {
  width: 36px; height: 36px;
  border-radius: 6px;
  object-fit: cover;
  cursor: pointer;
}
.pending-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: #475569;
}
.pending-close {
  cursor: pointer;
  color: #94a3b8;
  font-size: 12px;
}
.pending-close:hover { color: #ef4444; }

/* Input area */
.input-area {
  padding: 12px 18px 14px;
  border-top: 1px solid #f1f5f9;
}
.input-row { display: flex; align-items: center; gap: 8px; }
.input-wrapper { flex: 1; }
.input-wrapper :deep(.el-input__wrapper) {
  border-radius: 20px;
  padding: 4px 16px;
  box-shadow: 0 0 0 1px #e2e8f0;
}
.input-wrapper :deep(.el-input__wrapper:focus-within) {
  box-shadow: 0 0 0 2px #2563eb;
}
.horizon-select { width: 72px; }
.horizon-select :deep(.el-input__wrapper) { border-radius: 16px; }
.upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px; height: 36px;
  border-radius: 50%;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s;
}
.upload-btn:hover { background: #f1f5f9; color: #2563eb; }
.upload-btn.disabled { opacity: 0.4; cursor: not-allowed; }
.send-btn { flex-shrink: 0; }

/* Quick questions */
.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.quick-chip {
  padding: 4px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  font-size: 11px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}
.quick-chip:hover:not(:disabled) { border-color: #2563eb; color: #2563eb; }
.quick-chip:disabled { opacity: 0.5; cursor: not-allowed; }

/* Session dropdown */
.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 200px;
}
.session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.session-delete { color: #94a3b8; font-size: 12px; margin-left: 8px; }
.session-delete:hover { color: #ef4444; }

/* Image preview overlay */
.image-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: pointer;
}
.preview-full-img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 8px;
  object-fit: contain;
  cursor: default;
}
.preview-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 36px; height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-close:hover { background: rgba(255,255,255,0.3); }
</style>
