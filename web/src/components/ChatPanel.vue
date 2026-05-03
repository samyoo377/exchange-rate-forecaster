<template>
  <div class="chat-panel">
    <div class="chat-title">
      <el-icon><ChatDotRound /></el-icon> 预测问答
    </div>

    <div class="chat-messages" ref="msgContainer">
      <div v-if="predStore.messages.length === 0" class="chat-empty">
        <el-empty description="输入问题，开始预测分析" :image-size="60" />
      </div>
      <div
        v-for="(msg, i) in predStore.messages"
        :key="i"
        :class="['chat-bubble', msg.role]"
      >
        <div class="bubble-meta">{{ msg.role === 'user' ? '你' : '预测机' }}</div>
        <div class="bubble-text" v-html="renderText(msg.content)" />
        <PredictionDetail v-if="msg.prediction" :prediction="msg.prediction" />
      </div>
      <div v-if="predStore.loading" class="chat-bubble assistant">
        <div class="bubble-meta">预测机</div>
        <div class="bubble-text"><el-icon class="is-loading"><Loading /></el-icon> 分析中...</div>
      </div>
    </div>

    <div class="chat-input-area">
      <el-select v-model="horizon" size="small" style="width:90px;margin-right:8px">
        <el-option label="T+1" value="T+1" />
        <el-option label="T+2" value="T+2" />
        <el-option label="T+3" value="T+3" />
      </el-select>
      <el-input
        v-model="question"
        placeholder="例：未来T+2偏升还是偏贬？"
        @keyup.enter="send"
        :disabled="predStore.loading"
        clearable
        size="default"
        style="flex:1"
      />
      <el-button
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
        @click="sendQuick(q)"
      >{{ q }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from "vue"
import { usePredictionStore } from "../stores/prediction"
import PredictionDetail from "./PredictionDetail.vue"

const predStore = usePredictionStore()
const question = ref("")
const horizon = ref("T+2")
const msgContainer = ref<HTMLElement>()

const quickQuestions = [
  "未来T+2偏升还是偏贬？",
  "当前趋势是否强劲？",
  "RSI是否超卖？",
  "综合技术信号如何？",
]

async function send() {
  if (!question.value.trim()) return
  await predStore.ask(question.value.trim(), "USDCNH", horizon.value)
  question.value = ""
  scrollToBottom()
}

function sendQuick(q: string) {
  question.value = q
  send()
}

function renderText(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>")
}

function scrollToBottom() {
  nextTick(() => {
    if (msgContainer.value)
      msgContainer.value.scrollTop = msgContainer.value.scrollHeight
  })
}

watch(() => predStore.messages.length, scrollToBottom)
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
  word-break: break-all;
}
.chat-bubble.user .bubble-text { background: #ecf5ff; color: #303133; }
.chat-input-area { display: flex; align-items: center; margin-top: 8px; }
.quick-btns { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
</style>
