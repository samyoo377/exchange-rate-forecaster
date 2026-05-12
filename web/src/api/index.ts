import axios from "axios"
import type {
  ApiResponse,
  DashboardData,
  PredictionResult,
  TaskLog,
  PaginatedResult,
} from "../types/index"

const http = axios.create({ baseURL: "/" })

export async function getDashboard(symbol = "USDCNH", interval = "1d"): Promise<DashboardData | null> {
  const res = await http.get<ApiResponse<DashboardData>>(`/api/v1/dashboard/latest?symbol=${symbol}&interval=${interval}`)
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data
}

export async function refreshData(symbol = "USDCNH", source = "excel") {
  const res = await http.post<ApiResponse<{ taskId: string; status: string; snapshotCount: number }>>(
    "/api/v1/data/refresh",
    { symbol, source }
  )
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data
}

export async function importExcel(filePath: string, symbol = "USDCNH") {
  const res = await http.post<ApiResponse<{ taskId: string; inserted: number }>>(
    "/api/v1/files/import",
    { filePath, symbol }
  )
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data
}

export async function queryPrediction(
  question: string,
  symbol = "USDCNH",
  horizon = "T+2"
): Promise<PredictionResult> {
  const res = await http.post<ApiResponse<PredictionResult>>("/api/v1/predictions/query", {
    symbol,
    question,
    horizon,
  })
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data as PredictionResult
}

export async function getPredictionHistory(
  symbol = "USDCNH",
  page = 1,
  pageSize = 20,
  filters?: { direction?: string; horizon?: string; dateFrom?: string; dateTo?: string }
): Promise<PaginatedResult<PredictionResult>> {
  const params = new URLSearchParams({ symbol, page: String(page), pageSize: String(pageSize) })
  if (filters?.direction) params.set("direction", filters.direction)
  if (filters?.horizon) params.set("horizon", filters.horizon)
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom)
  if (filters?.dateTo) params.set("dateTo", filters.dateTo)
  const res = await http.get<ApiResponse<PaginatedResult<PredictionResult>>>(
    `/api/v1/history/predictions?${params.toString()}`
  )
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data as PaginatedResult<PredictionResult>
}

export interface PredictionStats {
  total: number
  bullish: number
  bearish: number
  neutral: number
  avgConfidence: number
  highConfidenceCount: number
  recentTrend: { date: string; bullish: number; bearish: number; neutral: number }[]
  confidenceTrend: { date: string; avg: number; count: number }[]
  horizonDistribution: { horizon: string; count: number }[]
}

export async function getPredictionStats(symbol = "USDCNH", days = 30): Promise<PredictionStats> {
  const res = await http.get<ApiResponse<PredictionStats>>(
    `/api/v1/history/predictions/stats?symbol=${symbol}&days=${days}`
  )
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data as PredictionStats
}

export async function getTaskHistory(
  taskType?: string,
  page = 1,
  pageSize = 20
): Promise<PaginatedResult<TaskLog>> {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (taskType) q.set("taskType", taskType)
  const res = await http.get<ApiResponse<PaginatedResult<TaskLog>>>(
    `/api/v1/history/tasks?${q.toString()}`
  )
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data as PaginatedResult<TaskLog>
}

export interface ChatStreamOptions {
  message: string
  symbol?: string
  horizon?: string
  sessionId?: string
  attachmentIds?: string[]
  history?: { role: "user" | "assistant"; content: string }[]
  pageContext?: { pageName: string; pageData?: string }
  onChunk: (content: string) => void
  onThinking?: () => void
  onError?: (error: string) => void
  onDone?: () => void
  onSessionId?: (id: string) => void
  signal?: AbortSignal
}

export async function streamChatMessage(opts: ChatStreamOptions) {
  const {
    message, symbol = "USDCNH", horizon = "T+2", sessionId, attachmentIds,
    history = [], pageContext, onChunk, onThinking, onError, onDone, onSessionId, signal,
  } = opts

  const response = await fetch("/api/v1/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, symbol, horizon, sessionId, attachmentIds, history, pageContext }),
    signal,
  })

  if (!response.ok) {
    const text = await response.text()
    onError?.(`请求失败 (${response.status}): ${text}`)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    onError?.("无法读取响应流")
    return
  }

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith("data: ")) continue
      const data = trimmed.slice(6)
      if (data === "[DONE]") {
        onDone?.()
        return
      }
      try {
        const parsed = JSON.parse(data)
        if (parsed.error) {
          onError?.(parsed.error)
          return
        }
        if (parsed.sessionId) {
          onSessionId?.(parsed.sessionId)
          continue
        }
        if (parsed.thinking) {
          onThinking?.()
          continue
        }
        if (parsed.content) onChunk(parsed.content)
      } catch {
        // skip malformed chunks
      }
    }
  }

  onDone?.()
}

export interface NewsDigest {
  id: string
  digestDate: string
  symbol: string
  headline: string
  summary: string
  keyFactors: { factor: string; direction: string; detail: string }[]
  sentiment: string
  modelVersion: string
  createdAt: string
}

export async function getLatestNewsDigest(symbol = "USDCNH"): Promise<NewsDigest | null> {
  const res = await http.get<ApiResponse<NewsDigest>>(`/api/v1/news/digest/latest?symbol=${symbol}`)
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data
}

export async function triggerNewsDigest(symbol = "USDCNH") {
  const res = await http.post<ApiResponse<{ digestId: string; headline: string }>>(
    "/api/v1/news/digest/trigger",
    { symbol }
  )
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data
}

// ── Chat Sessions ──

export interface ChatSessionSummary {
  id: string
  title: string | null
  symbol: string
  horizon: string
  createdAt: string
  updatedAt: string
}

export interface ChatSessionDetail {
  id: string
  title: string | null
  symbol: string
  horizon: string
  messages: { id: string; role: string; content: string; attachments: UploadedFileInfo[] | null; createdAt: string }[]
}

export async function getChatSessions(scope = "web"): Promise<ChatSessionSummary[]> {
  const res = await http.get<ApiResponse<ChatSessionSummary[]>>(`/api/v1/chat/sessions?scope=${scope}`)
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data ?? []
}

export async function getChatSession(id: string): Promise<ChatSessionDetail | null> {
  const res = await http.get<ApiResponse<ChatSessionDetail>>(`/api/v1/chat/sessions/${id}`)
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data
}

export async function deleteChatSession(id: string) {
  const res = await http.delete<ApiResponse<{ deleted: boolean }>>(`/api/v1/chat/sessions/${id}`)
  if (res.data.code !== 0) throw new Error(res.data.message)
}

// ── File Upload ──

export interface UploadedFileInfo {
  id: string
  storedPath: string
  originalName: string
  mimeType: string
  localUrl?: string
}

export async function uploadFile(file: File): Promise<UploadedFileInfo> {
  const formData = new FormData()
  formData.append("file", file)
  const res = await http.post<ApiResponse<UploadedFileInfo>>("/api/v1/files/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  if (res.data.code !== 0) throw new Error(res.data.message)
  const info = res.data.data as UploadedFileInfo

  try {
    const { cacheFileFromUpload } = await import("../utils/fileCache")
    info.localUrl = await cacheFileFromUpload(info.id, file)
  } catch {
    info.localUrl = URL.createObjectURL(file)
  }
  return info
}

// ── Indicator Configs ──

export interface IndicatorConfigInfo {
  indicatorType: string
  displayName: string
  description: string | null
  params: Record<string, any>
  signalThresholds: Record<string, any>
  dataKeys: string[]
  isBuiltin: boolean
  chartType: "line" | "bar"
  subChart: boolean
  category1: string | null
  category2: string | null
  category3: string | null
  groupId: string | null
  groupName: string | null
  groupColor: string | null
  groupSortOrder: number
}

export async function getIndicatorConfigs(): Promise<IndicatorConfigInfo[]> {
  const res = await http.get<ApiResponse<IndicatorConfigInfo[]>>("/api/v1/indicators/configs")
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data ?? []
}

// ── Predictions Timeline ──

export interface PredictionTimelineItem {
  id: string
  symbol: string
  direction: "bullish" | "bearish" | "neutral"
  confidence: number
  horizon: string
  createdAt: string
  modelVersion: string
  signalsSnapshot: string | null
  indicatorsSnapshot: string | null
  rationale: string | null
}

export async function getPredictionsTimeline(
  symbol = "USDCNH",
  limit = 30,
): Promise<PredictionTimelineItem[]> {
  const res = await http.get<ApiResponse<PredictionTimelineItem[]>>(
    `/api/v1/predictions/timeline?symbol=${symbol}&limit=${limit}`,
  )
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data ?? []
}

export async function getPredictionDetail(id: string): Promise<PredictionResult | null> {
  const res = await http.get<ApiResponse<PredictionResult>>(`/api/v1/predictions/${id}`)
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data
}

// ── Rate Data ──

export interface RateDataPoint {
  date: string
  rate: number
}

export interface RateTrendData {
  ccyPair: string
  queryType: string
  currentRate: number
  currentDateTime: string
  data: RateDataPoint[]
  ma5: (number | null)[]
  ma10: (number | null)[]
}

export interface RatePredictionPoint {
  date: string
  predicted: number
  upper: number
  lower: number
  confidence: number
}

export interface RatePredictionData {
  symbol: string
  historical: RateDataPoint[] | null
  predictions: RatePredictionPoint[]
  quantSignal: {
    compositeScore: number
    regime: string
    confidence: number
    timestamp: string
  } | null
  quantHistory: {
    compositeScore: number
    regime: string
    confidence: number
    timestamp: string
  }[]
}

export async function getRateTrend(queryType = "M", days = 30): Promise<RateTrendData | null> {
  const res = await http.get<ApiResponse<RateTrendData>>(
    `/api/v1/rate/trend?query_type=${queryType}&days=${days}`,
  )
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data
}

// ── FinBERT ──

export interface FinBertSummary {
  total: number
  positive: number
  negative: number
  neutral: number
  dominant: "positive" | "negative" | "neutral"
  dominantCn: string
}

export interface FinBertAnalysis {
  items: { text: string; label: string; labelCn: string; confidence: number }[]
  summary: FinBertSummary
}

export async function getFinBertStatus(): Promise<{ available: boolean }> {
  const res = await http.get<ApiResponse<{ available: boolean }>>("/api/v1/admin/finbert/status")
  if (res.data.code !== 0) return { available: false }
  return res.data.data ?? { available: false }
}

export async function runFinBertAnalysis(symbol = "USDCNH"): Promise<FinBertAnalysis | null> {
  const res = await http.post<ApiResponse<FinBertAnalysis>>("/api/v1/admin/finbert/analyze", { symbol })
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data
}

export async function getRatePrediction(days = 30): Promise<RatePredictionData | null> {
  const res = await http.get<ApiResponse<RatePredictionData>>(
    `/api/v1/rate/prediction?days=${days}`,
  )
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data
}
