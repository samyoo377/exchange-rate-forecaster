import { defineStore } from "pinia"
import { ref } from "vue"
import axios from "axios"

const http = axios.create({ baseURL: "/" })

export interface QuantSignalItem {
  name: string
  score: number
  confidence: number
  description: string
  metadata?: Record<string, number>
}

export interface QuantSnapshot {
  id: string
  symbol: string
  snapshotDate: string
  compositeScore: number
  regime: string
  confidence: number
  signals: QuantSignalItem[]
  metadata: Record<string, any> | null
  createdAt: string
}

export interface DataSourceHealth {
  name: string
  healthy: boolean
  lastLatencyMs: number
  successRate: number
  lastSuccessAt: string | null
  lastError: string | null
}

export const useQuantStore = defineStore("quant", () => {
  const latest = ref<QuantSnapshot | null>(null)
  const history = ref<QuantSnapshot[]>([])
  const sourcesHealth = ref<DataSourceHealth[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLatest(symbol = "USDCNH") {
    loading.value = true
    error.value = null
    try {
      const res = await http.get(`/api/v1/quant/latest?symbol=${symbol}`)
      latest.value = res.data.data
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function fetchHistory(symbol = "USDCNH", limit = 30) {
    try {
      const res = await http.get(`/api/v1/quant/history?symbol=${symbol}&limit=${limit}`)
      history.value = res.data.data ?? []
    } catch {
      // non-critical
    }
  }

  async function fetchSourcesHealth() {
    try {
      const res = await http.get("/api/v1/quant/sources/health")
      sourcesHealth.value = res.data.data ?? []
    } catch {
      // non-critical
    }
  }

  async function triggerAnalysis(symbol = "USDCNH") {
    loading.value = true
    error.value = null
    try {
      await http.post("/api/v1/quant/trigger", { symbol })
      await fetchLatest(symbol)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return {
    latest, history, sourcesHealth, loading, error,
    fetchLatest, fetchHistory, fetchSourcesHealth, triggerAnalysis,
  }
})
