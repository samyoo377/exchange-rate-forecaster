import type { RouteMetadata } from "../services/ai/apiRegistry.js"

export const QUANT_ROUTE_METADATA: RouteMetadata[] = [
  { method: "GET", path: "/api/v1/quant/latest", description: "获取最新量化信号（compositeScore, regime, confidence）" },
  { method: "GET", path: "/api/v1/quant/history", description: "获取量化信号历史记录，支持 symbol 和 limit 参数" },
  { method: "POST", path: "/api/v1/quant/trigger", description: "手动触发量化分析计算" },
  { method: "POST", path: "/api/v1/quant/enhanced/trigger", description: "触发增强量化分析（7大策略全量计算）" },
  { method: "GET", path: "/api/v1/quant/bundle", description: "获取量化分析包（综合评分 + 各策略详情 + 数据质量）" },
  { method: "GET", path: "/api/v1/quant/strategies", description: "获取所有量化策略列表及其配置" },
  { method: "GET", path: "/api/v1/quant/adapters", description: "获取所有数据源适配器信息" },
  { method: "GET", path: "/api/v1/quant/sources/health", description: "获取数据源健康状态" },
  { method: "GET", path: "/api/v1/quant/cron/status", description: "获取量化定时任务状态" },
  { method: "POST", path: "/api/v1/quant/cron/trigger", description: "手动触发量化定时任务" },
]
