import type { RouteMetadata } from "../services/ai/apiRegistry.js"

export const ROUTE_METADATA: RouteMetadata[] = [
  { method: "GET", path: "/health", description: "服务健康检查", aiExclude: true },
  { method: "POST", path: "/api/v1/data/refresh", description: "手动刷新市场数据（Alpha Vantage 或 Excel）" },
  { method: "POST", path: "/api/v1/files/import", description: "导入 Excel 文件中的市场数据" },
  { method: "POST", path: "/api/v1/files/upload", description: "上传文件（multipart）", aiExclude: true },
  { method: "POST", path: "/api/v1/chat/sessions", description: "创建新的聊天会话" },
  { method: "GET", path: "/api/v1/chat/sessions", description: "获取聊天会话列表（分页）" },
  { method: "GET", path: "/api/v1/chat/sessions/:id", description: "获取指定会话及其消息" },
  { method: "DELETE", path: "/api/v1/chat/sessions/:id", description: "删除聊天会话" },
  { method: "GET", path: "/api/v1/dashboard/latest", description: "获取最新行情数据（OHLC + 指标），支持 symbol 和 interval 参数" },
  { method: "GET", path: "/api/v1/indicators/configs", description: "获取所有技术指标配置" },
  { method: "POST", path: "/api/v1/predictions/query", description: "基于问题执行预测分析" },
  { method: "GET", path: "/api/v1/history/predictions", description: "获取预测历史记录（分页，支持 direction/horizon/日期筛选）" },
  { method: "GET", path: "/api/v1/history/predictions/stats", description: "获取预测统计数据" },
  { method: "GET", path: "/api/v1/history/tasks", description: "获取任务执行历史（分页）" },
  { method: "POST", path: "/api/v1/chat/stream", description: "AI 聊天流式接口（SSE）", aiExclude: true },
  { method: "POST", path: "/api/v1/news/fetch", description: "立即触发新闻抓取" },
  { method: "POST", path: "/api/v1/news/digest/trigger", description: "触发新闻摘要生成" },
  { method: "GET", path: "/api/v1/news/digest/latest", description: "获取最新新闻摘要" },
  { method: "GET", path: "/api/v1/predictions/timeline", description: "获取预测时间线（用于图表展示）" },
  { method: "GET", path: "/api/v1/predictions/:id", description: "获取单条预测详情" },
]
