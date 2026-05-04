<template>
  <div class="chat-panel">
    <div class="chat-title">
      <el-icon><ChatDotRound /></el-icon> 预测问答
      <el-switch
        v-model="useAI"
        active-text="AI分析"
        inactive-text="规则引擎"
        size="small"
        style="margin-left: auto"
      />
      <el-dropdown trigger="click" @command="onSessionCommand" style="margin-left: 8px">
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
                <el-icon
                  class="session-delete"
                  @click.stop="deleteSession(s.id)"
                ><Close /></el-icon>
              </div>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- News digest banner -->
    <div v-if="predStore.newsDigest" class="news-banner" @click="showNewsDetail = !showNewsDetail">
      <span class="news-badge" :class="predStore.newsDigest.sentiment">
        {{ sentimentLabel }}
      </span>
      <span class="news-headline">{{ predStore.newsDigest.headline }}</span>
      <el-icon class="news-toggle"><ArrowDown v-if="!showNewsDetail" /><ArrowUp v-else /></el-icon>
    </div>
    <div v-if="showNewsDetail && predStore.newsDigest" class="news-detail">
      <p class="news-summary">{{ predStore.newsDigest.summary }}</p>
      <div v-if="predStore.newsDigest.keyFactors?.length" class="news-factors">
        <span
          v-for="(f, i) in predStore.newsDigest.keyFactors"
          :key="i"
          class="factor-tag"
          :class="f.direction"
        >{{ f.factor }}</span>
      </div>
    </div>

    <div class="chat-messages" ref="msgContainer">
      <div v-if="predStore.messages.length === 0" class="chat-empty">
        <el-empty :description="emptyDesc" :image-size="60" />
      </div>
      <div
        v-for="(msg, i) in predStore.messages"
        :key="i"
        :class="['chat-bubble', msg.role]"
      >
        <div class="bubble-meta">{{ msg.role === 'user' ? '你' : metaLabel }}</div>
        <!-- Show image attachments -->
        <div v-if="msg.attachments?.length" class="attachment-list">
          <div
            v-for="att in msg.attachments"
            :key="att.id"
            class="attachment-thumb"
          >
            <img
              v-if="att.mimeType.startsWith('image/')"
              :src="`/uploads/${att.storedPath}`"
              :alt="att.originalName"
            />
            <el-tag v-else size="small" type="info">{{ att.originalName }}</el-tag>
          </div>
        </div>
        <div class="bubble-text" v-html="renderMarkdown(msg.content)" />
        <span v-if="msg.streaming && msg.content" class="streaming-cursor" />
        <PredictionDetail v-if="msg.prediction" :prediction="msg.prediction" />
      </div>

      <!-- thinking placeholder -->
      <div v-if="predStore.thinking" class="chat-bubble assistant">
        <div class="bubble-meta">{{ metaLabel }}</div>
        <div class="bubble-text thinking-dots">
          <span /><span /><span />
        </div>
      </div>
    </div>

    <!-- Pending attachments preview -->
    <div v-if="predStore.pendingAttachments.length > 0" class="pending-attachments">
      <div
        v-for="att in predStore.pendingAttachments"
        :key="att.id"
        class="pending-item"
      >
        <img
          v-if="att.mimeType.startsWith('image/')"
          :src="`/uploads/${att.storedPath}`"
          class="pending-thumb"
        />
        <span v-else class="pending-name">{{ att.originalName }}</span>
        <el-icon class="pending-remove" @click="predStore.removeAttachment(att.id)"><Close /></el-icon>
      </div>
    </div>

    <div class="chat-input-area">
      <el-select v-model="horizon" size="small" style="width:90px;margin-right:8px">
        <el-option label="T+1" value="T+1" />
        <el-option label="T+2" value="T+2" />
        <el-option label="T+3" value="T+3" />
      </el-select>
      <label class="upload-btn" :class="{ disabled: predStore.loading || uploading }">
        <el-icon><Paperclip /></el-icon>
        <input
          type="file"
          accept="image/*,.txt,.json,.csv,.pdf"
          @change="handleFileSelect"
          :disabled="predStore.loading || uploading"
          style="display:none"
        />
      </label>
      <el-input
        v-model="question"
        placeholder="例：未来T+2偏升还是偏贬？(↑↓翻历史)"
        @keydown="onInputKeydown"
        :disabled="predStore.loading"
        clearable
        size="default"
        style="flex:1"
      />
      <el-button
        v-if="predStore.loading && useAI"
        type="danger"
        @click="predStore.stopStreaming()"
        style="margin-left:8px"
      >停止</el-button>
      <el-button
        v-else
        type="primary"
        @click="send"
        :loading="predStore.loading"
        style="margin-left:8px"
      >发送</el-button>
    </div>

    <div class="quick-btns">
      <el-button
        v-for="q in quickQuestions"
        :key="q"
        size="small"
        text
        :disabled="predStore.loading"
        @click="sendQuick(q)"
      >{{ q }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, computed, onMounted } from "vue"
import { usePredictionStore } from "../stores/prediction"
import { uploadFile } from "../api/index"
import PredictionDetail from "./PredictionDetail.vue"

const predStore = usePredictionStore()
const question = ref("")
const horizon = ref("T+2")
const msgContainer = ref<HTMLElement>()
const useAI = ref(true)
const showNewsDetail = ref(false)
const uploading = ref(false)

const sentHistory = ref<string[]>([])
let historyIndex = -1
let historyDraft = ""

const sentimentLabel = computed(() => {
  const s = predStore.newsDigest?.sentiment
  return s === "bullish" ? "偏多" : s === "bearish" ? "偏空" : "中性"
})

onMounted(async () => {
  predStore.fetchNewsDigest()
  await predStore.loadSessions()
  if (predStore.sessionId) {
    await predStore.loadSession(predStore.sessionId)
    scrollToBottom()
  }
})

const metaLabel = computed(() => useAI.value ? "AI 分析师" : "预测机")
const emptyDesc = computed(() =>
  useAI.value ? "输入问题，AI 将结合实时行情为你分析" : "输入问题，开始预测分析"
)

const quickQuestions = [
  "未来T+2偏升还是偏贬？",
  "当前趋势是否强劲？",
  "RSI是否超卖？",
  "综合技术信号如何？",
]

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ""

  uploading.value = true
  try {
    const result = await uploadFile(file)
    predStore.addAttachment(result)
  } catch (err) {
    console.error("Upload failed:", err)
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
  if (!question.value.trim()) return
  const q = question.value.trim()
  sentHistory.value.push(q)
  historyIndex = -1
  historyDraft = ""
  question.value = ""
  if (useAI.value) {
    await predStore.askAI(q, "USDCNH", horizon.value)
  } else {
    await predStore.ask(q, "USDCNH", horizon.value)
  }
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
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
watch(
  () => predStore.messages[predStore.messages.length - 1]?.content,
  scrollToBottom
)
watch(() => predStore.thinking, scrollToBottom)
</script>

<style scoped>
.chat-panel {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
  display: flex;
  flex-direction: column;
  height: 680px;
  padding: 12px;
}
.chat-title {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: #303133;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chat-empty { margin: auto; }
.chat-bubble { display: flex; flex-direction: column; max-width: 95%; }
.chat-bubble.user { align-self: flex-end; align-items: flex-end; }
.chat-bubble.assistant { align-self: flex-start; align-items: flex-start; }
.bubble-meta { font-size: 11px; color: #909399; margin-bottom: 3px; }
.bubble-text {
  background: #f0f2f5;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}
.bubble-text :deep(h2),
.bubble-text :deep(h3),
.bubble-text :deep(h4) {
  margin: 6px 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.bubble-text :deep(ul) {
  margin: 4px 0;
  padding-left: 18px;
}
.bubble-text :deep(li) { margin: 2px 0; }
.bubble-text :deep(code) {
  background: #e8eaed;
  border-radius: 3px;
  padding: 1px 4px;
  font-family: monospace;
  font-size: 12px;
}
.bubble-text :deep(strong) { font-weight: 600; color: #303133; }
.bubble-text :deep(hr) { border: none; border-top: 1px solid #dcdfe6; margin: 6px 0; }
.bubble-text :deep(p) { margin: 0 0 4px; }
.bubble-text :deep(p:last-child) { margin-bottom: 0; }
.chat-bubble.user .bubble-text { background: #ecf5ff; color: #303133; }
.streaming-cursor {
  display: inline-block;
  width: 6px;
  height: 14px;
  background: #409eff;
  margin-left: 2px;
  vertical-align: middle;
  animation: blink 0.8s infinite;
  border-radius: 1px;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.thinking-dots {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 10px 14px;
  min-width: 48px;
}
.thinking-dots span {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #909399;
  animation: bounce 1.2s infinite ease-in-out;
}
.thinking-dots span:nth-child(1) { animation-delay: 0s; }
.thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.chat-input-area { display: flex; align-items: center; margin-top: 8px; }
.quick-btns { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }

/* Upload button */
.upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  cursor: pointer;
  color: #606266;
  margin-right: 6px;
  transition: all .2s;
}
.upload-btn:hover { background: #f0f2f5; color: #409eff; }
.upload-btn.disabled { opacity: 0.4; cursor: not-allowed; }

/* Attachment display */
.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}
.attachment-thumb img {
  max-width: 120px;
  max-height: 80px;
  border-radius: 4px;
  object-fit: cover;
}

/* Pending attachments */
.pending-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 0;
}
.pending-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
}
.pending-thumb {
  width: 40px;
  height: 40px;
  border-radius: 3px;
  object-fit: cover;
}
.pending-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #606266;
}
.pending-remove {
  cursor: pointer;
  color: #909399;
  font-size: 12px;
}
.pending-remove:hover { color: #f56c6c; }

/* Session dropdown items */
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
.session-delete {
  color: #909399;
  font-size: 12px;
  margin-left: 8px;
  flex-shrink: 0;
}
.session-delete:hover { color: #f56c6c; }

/* News banner */
.news-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #606266;
  transition: background .2s;
}
.news-banner:hover { background: #ebeef5; }
.news-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}
.news-badge.bullish { background: #e6a23c; }
.news-badge.bearish { background: #67c23a; }
.news-badge.neutral { background: #909399; }
.news-headline { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.news-toggle { margin-left: auto; font-size: 12px; color: #909399; }
.news-detail {
  padding: 6px 10px;
  margin-bottom: 6px;
  background: #fafbfc;
  border-radius: 0 0 6px 6px;
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
}
.news-summary { margin: 0 0 6px; }
.news-factors { display: flex; flex-wrap: wrap; gap: 4px; }
.factor-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
.factor-tag.bullish { background: #fdf6ec; color: #e6a23c; }
.factor-tag.bearish { background: #f0f9eb; color: #67c23a; }
.factor-tag.neutral { background: #f4f4f5; color: #909399; }
</style>
