# 新闻消息面 RAG 功能实现清单

## 概述

为汇率预测系统新增消息面分析能力：定时抓取财经新闻 → AI 消化总结 → 融入 RAG 上下文，在聊天分析中以技术面为主、消息面为辅的方式呈现。

---

## 一、数据库层

### 1. Prisma Schema 新增模型 (`prisma/schema.prisma`)

| 模型 | 用途 | 关键字段 |
|------|------|----------|
| `NewsRawItem` | 存储从各信息源抓取的原始新闻 | `source`, `title`, `url`, `summary`, `publishedAt`, `fetchedAt`, `category` |
| `NewsDigest` | 存储 AI 消化后的结构化摘要 | `headline`, `summary`, `keyFactors`(JSON), `sentiment`, `rawItemIds`(JSON), `modelVersion` |

- `NewsRawItem` 以 `url` 为唯一约束，防止重复入库
- `NewsDigest.keyFactors` 存储 JSON 数组，每个因素包含 `factor`/`direction`/`detail`

---

## 二、后端服务层

### 2. 新闻抓取服务 (`server/src/services/news/newsFetcher.ts`)

- 从 5 个信息源并发抓取新闻：
  - **fx168** (RSS) — 外汇专业资讯
  - **wallstreetcn** (RSS) — 华尔街见闻
  - **caixin** (RSS via RSSHub) — 财新网
  - **reuters_fx** (RSS via RSSHub) — 路透社市场频道
  - **jin10** (JSON API) — 金十数据快讯
- 使用 `rss-parser` 解析 RSS，`axios` 请求 JSON API
- 通过 `upsert` 去重写入 `NewsRawItem` 表
- 单个源失败不影响其他源（`Promise.allSettled`）

### 3. 新闻消化服务 (`server/src/services/news/newsDigester.ts`)

- 从 `NewsRawItem` 取最近 2 小时内的新闻（最多 80 条）
- 调用 **GPT-5.4** (`gpt-5.4-2026-03-05`) 进行消化总结
- API 配置读取自环境变量 `ABL_API_BASE_URL` + `ABL_API_TOKEN`
- 输出结构化 JSON：`headline` / `summary` / `keyFactors[]` / `sentiment`
- 结果写入 `NewsDigest` 表
- 提供 `getLatestDigest()` 和 `getRecentDigests()` 查询方法

### 4. 定时任务 (`server/src/services/news/cronJobs.ts`)

| Cron 任务 | 频率 | 功能 |
|-----------|------|------|
| 新闻抓取 | 每 1 分钟 | 调用 `fetchAllNews()` 从各源拉取最新新闻 |
| 新闻消化 | 每 30 分钟 | 调用 `digestRecentNews()` 用 GPT-5.4 生成摘要 |

- 服务启动时自动注册（`app.ts` 中调用 `startNewsCronJobs()`）
- 启动时立即执行一次新闻抓取

### 5. 导出索引 (`server/src/services/news/index.ts`)

统一导出所有新闻相关服务函数。

---

## 三、API 路由层

### 6. 新增路由 (`server/src/routes/index.ts`)

| 方法 | 路径 | 功能 |
|------|------|------|
| `POST` | `/api/v1/news/fetch` | 手动触发新闻抓取 |
| `POST` | `/api/v1/news/digest/trigger` | 手动触发新闻消化（支持 `symbol` 参数） |
| `GET` | `/api/v1/news/digest/latest` | 获取最新消息面摘要（支持 `symbol` query） |

---

## 四、RAG 集成

### 7. 聊天服务更新 (`server/src/services/ai/chatService.ts`)

- `buildRAGContext()` 新增消息面摘要区块：
  - 查询最新 `NewsDigest`
  - 格式化为 `## 消息面摘要` 段落，包含标题、情绪、摘要、关键因素
  - 追加在技术面数据之后
  - 查询失败不影响主流程（静默降级）
- 系统提示词更新：
  - 新增第 5 条职责：消息面解读
  - 回答要求新增：技术面为主，消息面为辅，用"📰 消息面参考"小节简要概括

---

## 五、前端展示

### 8. API 层 (`web/src/api/index.ts`)

- 新增 `NewsDigest` 类型定义
- 新增 `getLatestNewsDigest()` — 获取最新摘要
- 新增 `triggerNewsDigest()` — 手动触发消化

### 9. 状态管理 (`web/src/stores/prediction.ts`)

- 新增 `newsDigest` 响应式状态
- 新增 `fetchNewsDigest()` action

### 10. 聊天面板 (`web/src/components/ChatPanel.vue`)

- 新增可折叠的消息面横幅（news banner）：
  - 显示情绪标签（偏多/偏空/中性）+ 标题
  - 点击展开显示完整摘要和关键因素标签
  - 颜色编码：bullish=橙色, bearish=绿色, neutral=灰色
- 组件挂载时自动拉取最新摘要

---

## 六、依赖变更

| 包名 | 版本 | 位置 | 用途 |
|------|------|------|------|
| `rss-parser` | latest | server | 解析 RSS 订阅源 |

---

## 七、环境变量

| 变量 | 用途 | 来源 |
|------|------|------|
| `ABL_API_BASE_URL` | GPT-5.4 API 地址 | `.env.development` |
| `ABL_API_TOKEN` | GPT-5.4 API 密钥 | `.env.development` |

---

## 八、文件变更汇总

| 文件 | 操作 |
|------|------|
| `prisma/schema.prisma` | 修改 — 新增 `NewsRawItem` + `NewsDigest` 模型 |
| `server/src/services/news/newsFetcher.ts` | 新增 — 新闻抓取服务 |
| `server/src/services/news/newsDigester.ts` | 新增 — 新闻消化服务（GPT-5.4） |
| `server/src/services/news/cronJobs.ts` | 新增 — 定时任务注册 |
| `server/src/services/news/index.ts` | 新增 — 导出索引 |
| `server/src/app.ts` | 修改 — 启动时注册 cron jobs |
| `server/src/routes/index.ts` | 修改 — 新增 3 个新闻 API 路由 |
| `server/src/services/ai/chatService.ts` | 修改 — RAG 上下文集成消息面 + 系统提示词更新 |
| `web/src/api/index.ts` | 修改 — 新增新闻 API 调用 |
| `web/src/stores/prediction.ts` | 修改 — 新增 newsDigest 状态 |
| `web/src/components/ChatPanel.vue` | 修改 — 新增消息面横幅 UI |
| `NEWS_RAG_CHECKLIST.md` | 新增 — 本文档 |
