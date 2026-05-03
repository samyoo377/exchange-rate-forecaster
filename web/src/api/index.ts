import axios from "axios"
import type {
  ApiResponse,
  DashboardData,
  PredictionResult,
  TaskLog,
  PaginatedResult,
} from "../types/index"

const http = axios.create({ baseURL: "/" })

export async function getDashboard(symbol = "USDCNH"): Promise<DashboardData | null> {
  const res = await http.get<ApiResponse<DashboardData>>(`/api/v1/dashboard/latest?symbol=${symbol}`)
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
  pageSize = 20
): Promise<PaginatedResult<PredictionResult>> {
  const res = await http.get<ApiResponse<PaginatedResult<PredictionResult>>>(
    `/api/v1/history/predictions?symbol=${symbol}&page=${page}&pageSize=${pageSize}`
  )
  if (res.data.code !== 0) throw new Error(res.data.message)
  return res.data.data as PaginatedResult<PredictionResult>
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
