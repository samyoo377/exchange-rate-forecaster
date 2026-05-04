import axios from "axios"

const http = axios.create({ baseURL: "/" })

export interface CronJobStatus {
  name: string
  cron: string
  intervalMs: number
  running: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  lastResult: "success" | "error" | null
  lastError: string | null
  lastDurationMs: number | null
  totalRuns: number
  totalErrors: number
  startedAt: string | null
}

export interface TableInfo {
  name: string
  count: number
}

export interface TableQueryResult {
  rows: any[]
  total: number
  take: number
  skip: number
}

export interface TableSchema {
  table: string
  fields: string[]
  fieldTypes?: Record<string, string>
  enumValues?: Record<string, string[]>
}

function unwrap<T>(res: { data: { code: number; data: T } }): T {
  return res.data.data
}

// ── Cron ──
export async function getCronStatus(): Promise<CronJobStatus[]> {
  return unwrap(await http.get("/api/v1/admin/cron/status"))
}

export async function triggerFetch() {
  return unwrap(await http.post("/api/v1/admin/cron/trigger/fetch"))
}

export async function triggerDigest() {
  return unwrap(await http.post("/api/v1/admin/cron/trigger/digest"))
}

// ── Tables ──
export async function getTableList(): Promise<TableInfo[]> {
  return unwrap(await http.get("/api/v1/admin/tables"))
}

export async function getTableSchema(table: string): Promise<TableSchema> {
  return unwrap(await http.get(`/api/v1/admin/tables/${table}/schema`))
}

export async function getDistinctValues(table: string, field: string): Promise<string[]> {
  return unwrap(await http.get(`/api/v1/admin/tables/${table}/distinct/${field}`))
}

export async function queryTable(
  table: string,
  params: {
    where?: Record<string, any>
    filters?: Record<string, string>
    orderBy?: Record<string, string>
    take?: number
    skip?: number
  }
): Promise<TableQueryResult> {
  return unwrap(await http.post(`/api/v1/admin/tables/${table}/query`, params))
}

// ── Admin AI Chat (SSE) ──
export interface AdminModel {
  id: string
  name: string
  description: string
  speed: string
  capability: string
}

export async function getAdminModels(): Promise<AdminModel[]> {
  return unwrap(await http.get("/api/v1/admin/models"))
}

export function streamAdminChat(
  message: string,
  history: { role: string; content: string }[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  sessionId?: string,
  onSessionId?: (id: string) => void,
  model?: string,
): AbortController {
  const controller = new AbortController()
  let hadError = false

  fetch("/api/v1/admin/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, sessionId, model }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        onError(`HTTP ${res.status}`)
        return
      }
      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buf = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith("data: ")) continue
          const data = trimmed.slice(6)
          if (data === "[DONE]") {
            if (!hadError) onDone()
            return
          }
          try {
            const parsed = JSON.parse(data)
            if (parsed.sessionId) onSessionId?.(parsed.sessionId)
            if (parsed.error) {
              hadError = true
              onError(parsed.error)
              return
            }
            if (parsed.content) onChunk(parsed.content)
          } catch {
            // skip
          }
        }
      }
      if (!hadError) onDone()
    })
    .catch((e) => {
      if (e.name !== "AbortError") onError(e.message)
    })

  return controller
}

// ── Admin Chat Sessions ──

export interface AdminChatSession {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
}

export async function getAdminChatSessions(): Promise<AdminChatSession[]> {
  return unwrap(await http.get("/api/v1/admin/chat/sessions"))
}

export async function getAdminChatSession(id: string) {
  return unwrap(await http.get(`/api/v1/admin/chat/sessions/${id}`))
}

export async function deleteAdminChatSession(id: string) {
  return unwrap(await http.delete(`/api/v1/admin/chat/sessions/${id}`))
}

// ── News Fetch Logs ──

export async function getNewsFetchLogs(params?: { sourceId?: string; page?: number; pageSize?: number }): Promise<TableQueryResult> {
  const q = new URLSearchParams()
  if (params?.sourceId) q.set("sourceId", params.sourceId)
  if (params?.page) q.set("page", String(params.page))
  if (params?.pageSize) q.set("pageSize", String(params.pageSize))
  return unwrap(await http.get(`/api/v1/admin/news-fetch-logs?${q.toString()}`))
}

// ── News Sources ──

export async function getNewsSources(): Promise<any[]> {
  return unwrap(await http.get("/api/v1/admin/news-sources"))
}

export async function createNewsSource(data: Record<string, any>): Promise<any> {
  return unwrap(await http.post("/api/v1/admin/news-sources", data))
}

export async function updateNewsSource(id: string, data: Record<string, any>): Promise<any> {
  return unwrap(await http.put(`/api/v1/admin/news-sources/${id}`, data))
}

export async function deleteNewsSource(id: string): Promise<any> {
  return unwrap(await http.delete(`/api/v1/admin/news-sources/${id}`))
}

export async function testNewsSource(id: string): Promise<any> {
  return unwrap(await http.post(`/api/v1/admin/news-sources/${id}/test`))
}

// ── Indicator Configs ──

export async function getIndicatorConfigs(): Promise<any[]> {
  return unwrap(await http.get("/api/v1/admin/indicator-configs"))
}

export async function updateIndicatorConfig(id: string, data: Record<string, any>): Promise<any> {
  return unwrap(await http.put(`/api/v1/admin/indicator-configs/${id}`, data))
}

export async function createIndicatorConfig(data: Record<string, any>): Promise<any> {
  return unwrap(await http.post("/api/v1/admin/indicator-configs", data))
}

export async function deleteIndicatorConfig(id: string): Promise<any> {
  return unwrap(await http.delete(`/api/v1/admin/indicator-configs/${id}`))
}

export async function validateFormula(expression: string): Promise<{ valid: boolean; error?: string }> {
  return unwrap(await http.post("/api/v1/admin/indicator-configs/validate-formula", { expression }))
}

// ── News Digest ──

export interface NewsDigestDetail {
  id: string
  digestDate: string
  symbol: string
  headline: string
  summary: string
  keyFactors: { factor: string; direction: string; detail: string; heat?: number }[]
  sentiment: string
  rawItemIds: string
  modelVersion: string
  createdAt: string
  rawItems: {
    id: string
    source: string
    title: string
    url: string
    summary: string | null
    publishedAt: string | null
    category: string | null
  }[]
}

export async function getLatestDigest(symbol = "USDCNH"): Promise<NewsDigestDetail | null> {
  return unwrap(await http.get(`/api/v1/news/digest/latest?symbol=${symbol}`))
}

// ── Dashboard (for overview market analysis) ──

export interface DashboardIndicators {
  rsi14?: number
  stochK?: number
  stochD?: number
  cci20?: number
  adx14?: number
  plusDi14?: number
  minusDi14?: number
  ao?: number
  mom10?: number
}

export interface DashboardPrediction {
  direction: "bullish" | "bearish" | "neutral"
  confidence: number
  horizon: string
}

export interface DashboardData {
  symbol: string
  lastUpdatedAt: string
  indicators: DashboardIndicators
  latestPrediction: DashboardPrediction | null
}

export async function getDashboardData(symbol = "USDCNH"): Promise<DashboardData | null> {
  return unwrap(await http.get(`/api/v1/dashboard/latest?symbol=${symbol}`))
}
