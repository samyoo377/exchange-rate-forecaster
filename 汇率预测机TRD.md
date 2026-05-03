# 汇率预测机TRD

## 1. 文档目标
本文档用于给出“汇率预测机”一期的技术实现方案，覆盖系统边界、模块职责、数据流、核心对象、工程结构建议、接口设计、部署配置与实施路线，以支持产品方案落地。

## 2. 输入背景与设计依据
当前已知输入包括：
- 初步思路：聊天界面 + 数据大盘 + 两类 Agent 协同
- api.ts：已出现 Alpha Vantage 文档地址，说明外汇数据接入可从该 API 起步
- package.json：项目目前仍是基础 Node 仓库，尚未完成前后端脚手架搭建
- 本地文件：存在 PDF 业务材料与 Excel 样例数据，可作为字段映射、演示数据与验证样本来源

因此，一期技术目标应优先聚焦“最小可用链路”，避免一开始做成复杂多服务系统。

## 3. 一期技术目标
- 建立一个可运行的前端工作台，承载聊天界面与数据大盘
- 建立一个数据抓取与结构化摘要链路
- 建立一个策略演算与预测输出链路
- 建立一个统一的数据结构，使页面、中台、文件输出可复用同一份结果
- 建立最小可观测与可追溯能力

## 4. 总体技术方案
建议采用“前端工作台 + 轻量服务层 + Agent 编排层 + 数据存储层”的四层结构。

### 4.1 前端工作台
职责：
- 展示聊天会话
- 展示汇率图表与指标卡片
- 展示最新预测结果与历史记录
- 提供数据刷新、预测发起等操作入口

### 4.2 轻量服务层
职责：
- 对接前端请求
- 管理数据抓取、预测触发、历史记录查询
- 封装第三方 API
- 做基础鉴权、参数校验、错误包装

### 4.3 Agent 编排层
职责：
- 调用数据抓取 Agent
- 调用策略演算 Agent
- 对输入输出进行统一结构化封装
- 生成可复用的中间结果对象

### 4.4 数据存储层
职责：
- 保存原始行情数据
- 保存结构化摘要
- 保存预测结果
- 保存任务日志、运行状态和版本信息

## 5. 推荐技术栈
基于当前仓库几乎为空，建议直接采用成熟、落地快的前后端组合：

### 5.1 前端
- 框架：vue 3 + vue-router
- 语言：TypeScript
- UI：Tailwind CSS + element组件库
- 图表：ECharts 或 Recharts
- 状态管理：优先使用 vue 3+pinia 状态管理

选择理由：
- 便于同时承载页面与轻量接口
- TypeScript 对结构化数据约束更友好
- 对后续接 AI 接口、服务端路由、部署都较顺手

### 5.2 服务层
- 独立 Node 服务

### 5.3 数据存储
- 本地开发：SQLite
- 服务数据库: mysql
- ORM：Prisma

选择理由：
- 结构化对象较多，关系型存储更适合追溯和查询
- Prisma 能快速形成 schema、迁移和类型安全访问

### 5.4 Agent / AI 能力层
- 可先做规则引擎 + 模型辅助解释的混合模式
- 若接入大模型，建议通过统一 Provider 封装，不在业务代码中散落调用
- 需要统一 Prompt 模板、输入数据结构和输出 Schema

### 5.5 任务调度
- 一期简单方案：定时任务 + 手动触发
- node-cron

## 6. 系统模块拆分
### 6.1 页面模块
建议拆分为：
- dashboard：数据大盘页面
- chat-panel：聊天区域
- prediction-card：预测结果卡片
- history-panel：历史记录区
- source-panel：数据来源与更新时间展示

### 6.2 服务模块
建议拆分为：
- market-data service：行情数据获取与缓存
- summary service：摘要生成与结构化处理
- prediction service：预测结果生成
- history service：查询历史记录
- file-ingestion service：本地文件导入与解析

### 6.3 Agent 模块
建议拆分为：
- data-harvester agent：抓取第三方数据与文件数据
- insight-formatter agent：生成摘要、标准化标签和结构化对象
- strategy-engine agent：基于规则与上下文生成预测结论

说明：
从工程实现角度，可以先把 data-harvester 与 insight-formatter 合并为一个数据处理 Agent，在代码结构上预留拆分能力。

## 7. 核心数据流
### 7.1 数据抓取流
1. 定时器或用户触发抓取
2. 服务层调用第三方汇率 API 或文件解析模块
3. 原始数据写入 raw_market_data
4. 标准化处理后写入 normalized_market_snapshot
5. 生成摘要后写入 insight_summary
6. 前端大盘读取最新 snapshot 与 summary

### 7.2 预测生成流
1. 用户在聊天区域发起问题
2. 服务层读取最近一个或多个 snapshot
3. 编排层将问题 + 数据上下文传给 strategy-engine
4. strategy-engine 输出统一 prediction_result
5. prediction_result 落库并返回前端
6. 前端同步展示结论、解释、风险和时间信息

### 7.3 文件沉淀流
1. 每次关键任务完成后输出结构化结果
2. 结果可写入数据库
3. 可选同步导出 JSON / Markdown / Excel 摘要文件
4. 中台或历史页可按时间查询展示

## 8. 核心数据模型建议
### 8.1 raw_market_data
字段建议：
- id
- source
- symbol
- payload
- fetched_at
- status
- error_message

### 8.2 normalized_market_snapshot
字段建议：
- id
- symbol
- snapshot_date
- open
- high
- low
- close
- volume
- source
- version
- created_at

### 8.3 insight_summary
字段建议：
- id
- symbol
- summary_title
- summary_text
- drivers
- tags
- source_refs
- created_at

### 8.4 prediction_result
字段建议：
- id
- symbol
- user_query
- horizon
- direction
- confidence
- rationale
- risk_notes
- model_version
- data_snapshot_refs
- created_at

### 8.5 task_run_log
字段建议：
- id
- task_type
- status
- input_ref
- output_ref
- started_at
- finished_at
- error_message

## 9. 统一输出 Schema 建议
两个 Agent 必须共用统一结果结构，建议至少定义以下对象：

```ts
export interface PredictionResult {
  symbol: string
  horizon: string
  direction: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  rationale: string[]
  riskNotes: string[]
  sourceRefs: string[]
  generatedAt: string
  snapshotVersion: string
}
```

```ts
export interface InsightSummary {
  symbol: string
  title: string
  summary: string
  drivers: string[]
  tags: string[]
  sourceRefs: string[]
  generatedAt: string
}
```

说明：
- 所有 Agent 输出都应强制结构化，不能只返回自然语言
- 聊天区展示的文本可以由结构化结果二次拼装生成

## 10. 外部数据接入建议
### 10.1 Alpha Vantage
当前 api.ts 指向 Alpha Vantage 文档，可作为首个外汇数据接入源。

接入建议：
- 封装独立 market provider 层
- 不在页面直接请求第三方 API
- 对返回字段进行统一映射
- 记录请求时间、状态与错误信息
- 对免费额度做缓存和限流控制

### 10.2 Excel 文件接入
USDCNH-BBG-20Days.xlsx 可作为一期验证数据。

接入建议：
- 编写 file ingestion 模块读取样例文件
- 建立列名映射与日期格式标准化
- 支持导入后写入 normalized_market_snapshot
- 用于本地开发时无外部 API 情况下的数据填充

### 10.3 PDF 业务材料接入
PDF 可作为产品与策略背景材料，不建议一期将其做成自动化主数据源。

建议用途：
- 提炼业务术语
- 补充预测解释模板
- 作为 Prompt 上下文素材之一

## 11. 接口设计建议
### 11.1 获取最新大盘数据
- GET /api/dashboard/latest

返回：
- 最新 snapshot
- 最新 insight summary
- 最新 prediction summary

### 11.2 手动触发数据抓取
- POST /api/data/refresh

入参：
- symbol
- source

返回：
- taskId
- status
- latest snapshot id

### 11.3 发起预测问答
- POST /api/predictions/query

入参：
- symbol
- question
- horizon

返回：
- structured prediction result
- formatted answer

### 11.4 查询历史记录
- GET /api/history?type=prediction
- GET /api/history?type=summary

### 11.5 导入本地样例文件
- POST /api/files/import

入参：
- filePath 或上传文件引用

## 12. 前端页面草图建议
### 12.1 首页布局
- 顶部：标题、币种切换、最后更新时间、刷新按钮
- 左侧：聊天问答区
- 右侧：图表、指标卡片、摘要卡片、最新预测卡片
- 底部或侧边：历史记录列表

### 12.2 重要交互
- 点击预置问题快速发起问答
- 点击某条历史预测查看详情
- 数据抓取失败时显示错误态和最近成功时间
- 预测生成中显示状态反馈

## 13. 错误处理与可观测性
一期最低要求：
- 所有抓取任务都记录开始时间、结束时间、状态与报错
- 所有预测请求都记录输入、输出与关联数据版本
- 前端对空数据、超时、第三方错误有明确提示
- 服务端日志中避免泄露敏感信息

建议补充：
- 增加任务运行日志表
- 增加接口级别错误码
- 增加简单健康检查接口

## 14. 安全与边界
- API Key 通过环境变量管理
- 不在前端暴露第三方密钥
- 对外部数据做基础格式校验
- 对 AI 输出做结构化校验，避免页面渲染异常
- 明确提示预测仅作为辅助分析，不作为自动交易指令

## 15. 工程目录建议
建议采用如下结构：

```text
exchange-rate-forecaster/
  app/
    api/
    dashboard/
    history/
  components/
  lib/
    agents/
    providers/
    services/
    schemas/
    db/
  prisma/
  data/
  public/
  package.json
```

说明：
- agents 放 Agent 编排与策略逻辑
- providers 放 Alpha Vantage 等第三方接入封装
- services 放面向业务的服务层
- schemas 放 zod / ts 类型定义
- data 可存放样例文件与本地导出结果

## 16. 落地实施顺序建议
### 阶段一：打通最小链路
- 初始化 Next.js + TypeScript 工程
- 配置 Tailwind、基础 UI、Prisma
- 接入 Alpha Vantage 或 Excel 导入二选一先跑通
- 完成首页静态布局
- 完成 dashboard/latest 与 predictions/query 两个核心接口

### 阶段二：补齐 Agent 协同
- 增加 data-harvester agent
- 增加 strategy-engine agent
- 固化统一输出 Schema
- 落库存储历史记录

### 阶段三：增强可用性
- 加入历史记录页
- 加入手动刷新与任务状态
- 加入失败重试与错误提示
- 加入基础权限区分

## 17. 为了让任务更容易落实，建议增加的配置
### 17.1 工程初始化配置
必须补齐：
- Next.js + TypeScript 脚手架
- ESLint
- Prettier
- Tailwind CSS
- 路径别名配置
- 环境变量模板

### 17.2 环境变量配置
建议至少包括：
- ALPHA_VANTAGE_API_KEY
- DATABASE_URL
- APP_BASE_URL
- DEFAULT_SYMBOL=USDCNH
- AI_PROVIDER_API_KEY（如后续接模型）
- AI_MODEL_NAME

### 17.3 数据配置
建议增加配置文件统一管理：
- 默认币种
- 默认预测周期
- 数据刷新频率
- 数据源优先级
- 文件导入目录

### 17.4 Schema 校验配置
建议采用 zod：
- 校验第三方 API 返回
- 校验 Agent 输出结构
- 校验前端接口请求参数

### 17.5 开发与部署配置
建议补齐：
- .env.example
- Prisma schema 与 migration
- 本地种子数据脚本
- mock 数据脚本
- 构建与启动脚本
- 简单 CI 检查（lint + typecheck）

### 17.6 样例数据配置
为了降低首期落地难度，建议同时保留两条数据路径：
- 在线数据：第三方汇率 API
- 离线数据：Excel 样例文件导入

这样即使外部 API 受限，也可以先完成页面、数据流与预测结构验证。

## 18. 技术风险与应对
### 风险一：第三方 API 不稳定
应对：
- 缓存最近成功结果
- 保留 Excel 导入回退路径
- 给数据源增加 provider 抽象层

### 风险二：AI 输出不稳定
应对：
- 强制结构化输出 Schema
- 优先用规则 + 模型混合模式
- 页面只消费校验通过的数据

### 风险三：过早多服务化导致复杂度过高
应对：
- 一期单仓、单前端工程内聚实现
- 等数据流和接口稳定后再考虑拆分服务

### 风险四：缺乏统一口径导致页面和 Agent 脱节
应对：
- 先定义统一实体和接口返回结构
- 页面、中台、文件导出全部复用同一 Schema

## 19. 建议的下一步实施任务
1. 初始化工程脚手架与基础依赖
2. 建立 Prisma 数据模型与统一 TypeScript Schema
3. 封装 Alpha Vantage provider 与 Excel 导入模块
4. 实现 dashboard/latest 与 predictions/query 接口
5. 搭建首页工作台布局
6. 接入历史记录与任务日志
7. 引入 Agent 编排与结构化输出校验

## 20. 结论
“汇率预测机”一期最合理的落地方式，不是先做复杂 AI 平台，而是先搭建一个可运行的工作台，围绕“数据输入标准化、预测输出结构化、页面展示可追溯”三件事打通最小闭环。只要统一好 Schema、数据源接入层和 Agent 输出格式，后续无论扩展模型能力、中台能力还是多币种能力，都会容易很多。
