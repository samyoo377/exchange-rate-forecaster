import { defineStore } from "pinia"
import { ref, computed } from "vue"
import type { PredictionResult } from "../types/index"
import {
  queryPrediction, streamChatMessage, getLatestNewsDigest,
  getChatSessions, getChatSession, deleteChatSession,
  type NewsDigest, type ChatSessionSummary, type UploadedFileInfo,
} from "../api/index"
import { warmUrlCache, getFileUrl } from "../utils/fileCache"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  prediction?: PredictionResult
  timestamp: string
  streaming?: boolean
  attachments?: UploadedFileInfo[]
}

const SESSION_KEY = "web_chat_session_id"

export const usePredictionStore = defineStore("prediction", () => {
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const thinking = ref(false)
  const error = ref<string | null>(null)
  const abortController = ref<AbortController | null>(null)
  const newsDigest = ref<NewsDigest | null>(null)

  const sessionId = ref<string | null>(localStorage.getItem(SESSION_KEY))
  const sessions = ref<ChatSessionSummary[]>([])
  const pendingAttachments = ref<UploadedFileInfo[]>([])

  const hasSession = computed(() => !!sessionId.value)

  function setSessionId(id: string | null) {
    sessionId.value = id
    if (id) {
      localStorage.setItem(SESSION_KEY, id)
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  }

  async function loadSessions() {
    try {
      sessions.value = await getChatSessions("web")
    } catch {
      // non-critical
    }
  }

  async function loadSession(id: string) {
    try {
      const detail = await getChatSession(id)
      if (!detail) {
        setSessionId(null)
        messages.value = []
        return
      }
      setSessionId(id)

      const allAttachmentIds = detail.messages
        .flatMap((m) => m.attachments ?? [])
        .map((a) => a.id)
      if (allAttachmentIds.length > 0) {
        await warmUrlCache(allAttachmentIds).catch(() => {})
      }

      messages.value = await Promise.all(
        detail.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map(async (m) => {
            const attachments = m.attachments?.length
              ? await Promise.all(
                  m.attachments.map(async (a) => ({
                    ...a,
                    localUrl: (await getFileUrl(a.id).catch(() => null)) ?? undefined,
                  })),
                )
              : undefined
            return {
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: m.createdAt,
              attachments,
            }
          }),
      )
    } catch {
      setSessionId(null)
      messages.value = []
    }
  }

  async function removeSession(id: string) {
    await deleteChatSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (sessionId.value === id) {
      setSessionId(null)
      messages.value = []
    }
  }

  function newSession() {
    setSessionId(null)
    messages.value = []
    pendingAttachments.value = []
  }

  function addAttachment(file: UploadedFileInfo) {
    pendingAttachments.value.push(file)
  }

  function removeAttachment(fileId: string) {
    pendingAttachments.value = pendingAttachments.value.filter((f) => f.id !== fileId)
  }

  async function fetchNewsDigest(symbol = "USDCNH") {
    try {
      newsDigest.value = await getLatestNewsDigest(symbol)
    } catch {
      // non-critical
    }
  }

  async function ask(question: string, symbol = "USDCNH", horizon = "T+2") {
    messages.value.push({
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    })
    loading.value = true
    error.value = null
    try {
      const result = await queryPrediction(question, symbol, horizon)
      messages.value.push({
        role: "assistant",
        content: buildAnswerText(result),
        prediction: result,
        timestamp: new Date().toISOString(),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      error.value = msg
      messages.value.push({
        role: "assistant",
        content: `预测失败：${msg}`,
        timestamp: new Date().toISOString(),
      })
    } finally {
      loading.value = false
    }
  }

  async function askAI(question: string, symbol = "USDCNH", horizon = "T+2") {
    const attachments = [...pendingAttachments.value]
    const attachmentIds = attachments.map((a) => a.id)
    pendingAttachments.value = []

    messages.value.push({
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
      attachments: attachments.length > 0 ? attachments : undefined,
    })

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      streaming: true,
    }
    messages.value.push(assistantMsg)

    loading.value = true
    error.value = null
    thinking.value = true
    abortController.value = new AbortController()

    const history = sessionId.value
      ? []
      : messages.value
          .slice(0, -2)
          .filter((m) => !m.prediction)
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }))

    try {
      await streamChatMessage({
        message: question,
        symbol,
        horizon,
        sessionId: sessionId.value ?? undefined,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        history,
        signal: abortController.value.signal,
        onSessionId(id) {
          setSessionId(id)
        },
        onThinking() {
          thinking.value = false
        },
        onChunk(content) {
          thinking.value = false
          const last = messages.value[messages.value.length - 1]
          if (last && last.streaming) {
            last.content += content
          }
        },
        onError(errMsg) {
          error.value = errMsg
          const last = messages.value[messages.value.length - 1]
          if (last && last.streaming) {
            last.content = `分析失败：${errMsg}`
            last.streaming = false
          }
        },
        onDone() {
          thinking.value = false
          const last = messages.value[messages.value.length - 1]
          if (last && last.streaming) {
            last.streaming = false
          }
          loadSessions()
        },
      })
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      const msg = e instanceof Error ? e.message : String(e)
      error.value = msg
      const last = messages.value[messages.value.length - 1]
      if (last && last.streaming) {
        last.content = `分析失败：${msg}`
        last.streaming = false
      }
    } finally {
      loading.value = false
      thinking.value = false
      abortController.value = null
    }
  }

  function stopStreaming() {
    abortController.value?.abort()
    abortController.value = null
    const last = messages.value[messages.value.length - 1]
    if (last?.streaming) {
      last.streaming = false
    }
    loading.value = false
    thinking.value = false
  }

  function buildAnswerText(r: PredictionResult): string {
    const dirLabel = r.direction === "bullish" ? "偏升（看多）" : r.direction === "bearish" ? "偏贬（看空）" : "中性（震荡）"
    return `**${r.horizon} 预测结论：${dirLabel}**\n置信度：${(r.confidence * 100).toFixed(1)}%`
  }

  return {
    messages, loading, thinking, error, newsDigest,
    sessionId, sessions, pendingAttachments, hasSession,
    ask, askAI, stopStreaming, fetchNewsDigest,
    loadSessions, loadSession, removeSession, newSession,
    addAttachment, removeAttachment, setSessionId,
  }
})
