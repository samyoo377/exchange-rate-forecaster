import { defineStore } from "pinia"
import { ref } from "vue"
import type { PredictionResult } from "../types/index"
import { queryPrediction } from "../api/index"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  prediction?: PredictionResult
  timestamp: string
}

export const usePredictionStore = defineStore("prediction", () => {
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

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
        content: `❌ 预测失败：${msg}`,
        timestamp: new Date().toISOString(),
      })
    } finally {
      loading.value = false
    }
  }

  function buildAnswerText(r: PredictionResult): string {
    const dirLabel = r.direction === "bullish" ? "偏升（看多）" : r.direction === "bearish" ? "偏贬（看空）" : "中性（震荡）"
    return `**${r.horizon} 预测结论：${dirLabel}**\n置信度：${(r.confidence * 100).toFixed(1)}%`
  }

  return { messages, loading, error, ask }
})
