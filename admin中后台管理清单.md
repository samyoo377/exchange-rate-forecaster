# Admin 中后台管理系统清单

## 一、快速启动

```bash
# 1. 安装依赖（根目录）
pnpm install

# 2. 推送数据库表结构（如首次或 schema 有变更）
DATABASE_URL="file:./dev.db" ./server/node_modules/.bin/prisma db push --accept-data-loss

# 3. 启动后端服务（端口 3001）
pnpm dev:server

# 4. 启动 Admin 管理后台（端口 5174）
pnpm dev:admin

# 5.（可选）同时启动前台（端口 5173）
pnpm dev:web
```

**访问地址：**
- 管理后台：http://localhost:5174
- 前台应用：http://localhost:5173
- API 服务：http://localhost:3001

---

## 二、系统架构

```
┌────────────────────────────────────────────────────────────────┐
│  Admin 前端 (Vue3 + Element Plus)   端口 5174                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ 系统概览 │ │ 定时任务 │ │ 数据浏览 │ │ AI 助手  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────┬──────────────────────────────────────────┘
                      │ HTTP (Vite Proxy → :3001)
┌─────────────────────▼──────────────────────────────────────────┐
│  Fastify 后端   端口 3001                                       │
│  ┌─────────────────────────────────────────┐                   │
│  │ Admin API Routes (/api/v1/admin/...)    │                   │
│  │  • GET  /cron/status                    │                   │
│  │  • POST /cron/trigger/fetch             │                   │
│  │  • POST /cron/trigger/digest            │                   │
│  │  • GET  /tables                         │                   │
│  │  • GET  /tables/:table/schema           │                   │
│  │  • POST /tables/:table/query            │                   │
│  │  • POST /chat/stream (SSE)              │                   │
│  └─────────────────────────────────────────┘                   │
│  ┌───────────────────┐  ┌──────────────────┐                   │
│  │ Cron: 新闻抓取    │  │ Cron: 新闻消化   │                   │
│  │ 每 1 分钟         │  │ 每 30 分钟       │                   │
│  └───────────────────┘  └──────────────────┘                   │
│  ┌───────────────────────────────────────────┐                 │
│  │ Admin Assistant (Claude Sonnet 4.6)       │                 │
│  │  → 数据库查询 → 结构化解读 → SSE 流式响应  │                 │
│  └───────────────────────────────────────────┘                 │
└─────────────────────┬──────────────────────────────────────────┘
                      │
┌─────────────────────▼──────────────────────────────────────────┐
│  SQLite (prisma/dev.db)                                        │
│  7 张表: RawMarketData, NormalizedMarketSnapshot,              │
│  InsightSummary, PredictionResult, TaskRunLog,                 │
│  NewsRawItem, NewsDigest                                       │
└────────────────────────────────────────────────────────────────┘
```

---

## 三、功能模块详解

### 3.1 系统概览页 (`/overview`)

| 功能项 | 说明 |
|--------|------|
| Cron 状态卡片 | 显示两个定时任务的运行状态、倒计时、上次结果、耗时 |
| 实时倒计时 | 每秒刷新，精确显示距下次执行的分秒 |
| 数据库表统计 | 7 张表的记录数，点击可跳转到数据浏览器 |
| 最新消息摘要 | 显示最新一条 NewsDigest 的标题和情绪判断 |
| 服务运行时间 | 显示 Fastify 服务器的 uptime |
| 自动刷新 | 每 10 秒自动拉取最新数据 |

### 3.2 定时任务页 (`/cron`)

| 功能项 | 说明 |
|--------|------|
| 圆环倒计时 | 可视化进度环显示距下次执行的时间比例 |
| 运行统计 | 总执行次数、失败次数、上次耗时 |
| 任务详情 | Cron 表达式、间隔、上次运行时间、启动时间、错误信息 |
| 手动触发 | 「立即执行」按钮分别触发新闻抓取和消化 |
| 执行日志 | 最近 10 条 TaskRunLog 表格，含状态标签 |
| 自动刷新 | 每 5 秒拉取 Cron 状态 + 每秒更新倒计时 |

### 3.3 数据浏览器页 (`/database`)

| 功能项 | 说明 |
|--------|------|
| 表选择器 | 下拉选择 7 张表，显示各表记录数 |
| URL 参数联动 | 支持 `?table=NewsRawItem` 直接打开指定表 |
| 动态字段检测 | 自动获取表字段，动态生成列 |
| 全字段排序 | 点击表头排序（custom sortable），支持 asc/desc |
| 条件筛选 | 选择字段 + 运算符（等于/包含/大于/小于） + 值 |
| 分页 | 支持 10/20/50/100 每页，跳页器 |
| JSON 弹窗 | JSON 字段显示「查看JSON」按钮，弹出格式化 JSON |
| 日期格式化 | 自动识别 ISO 日期字符串并本地化显示 |

### 3.4 AI 助手页 (`/assistant`)

| 功能项 | 说明 |
|--------|------|
| 模型 | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| 流式响应 | SSE 实时输出，带光标闪烁效果 |
| 数据库查询 | AI 生成结构化查询指令，自动执行并返回结果 |
| 上下文感知 | 每次请求携带数据库各表统计信息 |
| 对话历史 | 保留完整对话上下文，支持多轮追问 |
| 快捷问题 | 5 个预设问题一键发送 |
| Markdown 渲染 | 支持代码块、行内代码、加粗等 |

**预设快捷问题：**
1. 数据库各表有多少条数据？
2. 最近的新闻消化摘要是什么？
3. 最近5条预测结果是什么？
4. 有哪些失败的任务日志？
5. 新闻来源分布情况如何？

---

## 四、API 接口清单

### Admin 专用接口 (`/api/v1/admin/`)

| 方法 | 路径 | 功能 | 备注 |
|------|------|------|------|
| `GET` | `/cron/status` | 获取 Cron 任务状态 | 含 lastRunAt, running, totalRuns 等 |
| `POST` | `/cron/trigger/fetch` | 手动触发新闻抓取 | |
| `POST` | `/cron/trigger/digest` | 手动触发新闻消化 | 使用 GPT-5.4 模型 |
| `GET` | `/tables` | 获取所有表及记录数 | |
| `GET` | `/tables/:table/schema` | 获取表字段列表 | |
| `POST` | `/tables/:table/query` | 通用表查询 | 支持 where/orderBy/take/skip |
| `POST` | `/chat/stream` | AI 助手对话（SSE） | Claude Sonnet 4.6 |

### 通用查询参数

```json
{
  "where": {
    "source": "jin10",                    // 精确匹配
    "title": { "contains": "美联储" },     // 模糊搜索
    "confidence": { "gt": 0.8 },          // 大于
    "createdAt": { "lt": "2026-05-03" }   // 小于
  },
  "orderBy": { "createdAt": "desc" },
  "take": 20,
  "skip": 0
}
```

---

## 五、后端服务清单

### 新增文件

| 文件 | 用途 |
|------|------|
| `server/src/routes/admin.ts` | Admin API 路由注册（7 个端点） |
| `server/src/services/ai/adminAssistant.ts` | Claude Sonnet 4.6 管理助手服务 |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `server/src/app.ts` | 注册 admin 路由 |
| `server/src/services/news/cronJobs.ts` | 添加执行状态追踪（CronJobStatus 接口） |
| `server/src/services/news/index.ts` | 导出 getCronStatus |

### Cron 状态数据结构

```typescript
interface CronJobStatus {
  name: string           // "news_fetch" | "news_digest"
  cron: string           // cron 表达式
  intervalMs: number     // 间隔毫秒数
  running: boolean       // 是否正在执行
  lastRunAt: string      // 上次执行时间 (ISO)
  lastResult: string     // "success" | "error"
  lastError: string      // 错误信息
  lastDurationMs: number // 上次执行耗时
  totalRuns: number      // 总执行次数
  totalErrors: number    // 失败次数
  startedAt: string      // 服务启动时间
}
```

---

## 六、前端文件清单

### Admin 包结构 (`admin/`)

```
admin/
├── index.html                       # 入口 HTML
├── package.json                     # 依赖配置
├── vite.config.ts                   # Vite 配置（端口 5174，代理 → :3001）
├── tsconfig.json
├── tsconfig.node.json
└── src/
    ├── main.ts                      # Vue 应用入口
    ├── env.d.ts                     # 类型声明
    ├── App.vue                      # 布局：侧边栏 + 主内容区
    ├── api/
    │   └── index.ts                 # API 层（Cron/Table/Chat 请求）
    ├── router/
    │   └── index.ts                 # 4 条路由
    └── pages/
        ├── OverviewPage.vue         # 系统概览
        ├── CronJobsPage.vue         # 定时任务管理
        ├── DatabasePage.vue         # 数据浏览器
        └── AssistantPage.vue        # AI 助手
```

### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue 3 | 3.4+ | 响应式 UI |
| Element Plus | 2.7+ | UI 组件库 |
| Pinia | 2.1+ | 状态管理 |
| Vue Router | 4.3+ | 页面路由 |
| Vite | 5.3+ | 开发服务器 + 构建 |
| TypeScript | 5.4+ | 类型安全 |
| Axios | 1.7+ | HTTP 请求 |

---

## 七、AI 模型配置

| 用途 | 模型 | 配置来源 |
|------|------|----------|
| 新闻消化总结 | `gpt-5.4-2026-03-05` | `.env.development` 中的 `ABL_API_BASE_URL` + `ABL_API_TOKEN` |
| 前台聊天分析 | `gpt-5.4-2026-03-05` | 同上 |
| 管理后台 AI 助手 | `claude-sonnet-4-6` | 同上（同一 API 网关） |

**环境变量：**
```env
ABL_API_BASE_URL=https://api.ablai.top
ABL_API_TOKEN=sk-xxxxx
```

---

## 八、数据库表一览

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| RawMarketData | 原始市场 API 响应 | source, symbol, payload, status |
| NormalizedMarketSnapshot | OHLC 标准化快照 | symbol, snapshotDate, open/high/low/close |
| InsightSummary | 市场洞察摘要 | summaryTitle, summaryText, drivers |
| PredictionResult | 预测结果 | direction, confidence, rationale, horizon |
| TaskRunLog | 任务执行日志 | taskType, status, startedAt, errorMessage |
| NewsRawItem | 新闻原始数据 | source, title, url, summary, category |
| NewsDigest | AI 消化后的新闻摘要 | headline, summary, keyFactors, sentiment |

---

## 九、注意事项

1. **端口规划**：Server `:3001`，Web `:5173`，Admin `:5174`
2. **代理配置**：Admin 的 Vite 配置已将 `/api` 代理到 `:3001`
3. **数据库**：当前使用 SQLite（`prisma/dev.db`），适合开发环境；生产环境建议切换为 MySQL/PostgreSQL
4. **AI API**：管理助手和新闻消化共用同一个 API 网关地址和 Token
5. **Cron 状态**：为内存级追踪，服务重启后统计归零
6. **安全**：Admin 接口当前无鉴权，生产环境务必添加身份验证
