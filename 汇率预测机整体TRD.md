# 汇率预测机整体TRD（研发对接版）

## 1. 文档目标
本文件用于研发对接，定义“汇率预测机”一期的完整技术实现细节，覆盖：
- 前后端架构
- 数据模型与字段口径
- 指标计算与信号融合规则
- API 契约与错误码
- 前后端联调清单
- 任务拆解与验收标准

本版本明确采用技术栈：
- 前端：Vue 3 + Element Plus
- 后端：Node.js + MySQL

## 2. 范围与版本
### 2.1 一期范围（P0）
1. 单币对 USDCNH
2. 日线 OHLC 数据获取（Alpha Vantage + Excel 回退）
3. 指标计算：RSI / Stochastic / CCI / ADX / AO / MOM
4. 规则融合输出预测结论（bullish / bearish / neutral）
5. 页面工作台（聊天问答区 + 数据大盘区 + 历史记录区）
6. 预测结果结构化落库与追溯

### 2.2 不在一期范围
- 自动交易执行
- 高频/分钟级策略
- 多币对组合回测
- 复杂机器学习训练平台

## 3. 研发落地原则
1. 先闭环再优化：先打通“抓取→计算→预测→展示→留痕”。
2. 强制结构化：禁止仅返回自然语言，必须返回统一 schema。
3. 可解释优先：每次预测必须输出依据与风险提示。
4. 可追溯优先：每条结果都要可回溯到数据版本与任务日志。

## 4. 总体技术架构

```text
[Vue3 + Element Plus 前端]
        |
        | HTTP/JSON
        v
[Node.js API 层]
  ├─ market-data service（行情抓取）
  ├─ file-ingestion service（Excel导入）
  ├─ indicator service（指标计算）
  ├─ prediction service（规则融合）
  ├─ history service（历史查询）
  └─ scheduler service（定时触发）
        |
        v
[MySQL]
  ├─ raw_market_data
  ├─ normalized_market_snapshot
  ├─ indicator_snapshot
  ├─ insight_summary
  ├─ prediction_result
  └─ task_run_log
```

## 5. 技术选型与理由
### 5.1 前端
- Vue 3：组件化与组合式 API 适合复杂工作台。
- Element Plus：快速搭建企业级中台风格页面。
- ECharts：行情走势和指标图展示能力成熟。

### 5.2 后端
- Node.js（Express/Fastify 二选一，建议 Fastify）：
  - 高性能 JSON API
  - 与前端 TypeScript 协同良好
- MySQL 8：
  - 易于运维
  - 关系结构适合追溯与历史查询

### 5.3 调度策略
- 本地开发：node-cron + 手动接口触发
- 线上部署：外部调度器或平台 cron 调用后端接口

## 6. 模块职责拆解
### 6.1 market-data service
职责：
- 调用 Alpha Vantage 拉取日线 OHLC
- 映射并标准化字段
- 写入 raw_market_data 与 normalized_market_snapshot

### 6.2 file-ingestion service
职责：
- 解析本地 Excel（USDCNH-BBG-20Days.xlsx）
- 映射日期和价格列
- 作为 API 不可用时的回退数据源

### 6.3 indicator service
职责：
- 基于 normalized_market_snapshot 计算指标
- 输出单日指标快照写入 indicator_snapshot

### 6.4 prediction service
职责：
- 按规则融合指标信号
- 生成预测结果、依据、风险提示
- 持久化 prediction_result

### 6.5 history service
职责：
- 查询历史抓取任务
- 查询历史预测结果
- 提供筛选、分页、详情

### 6.6 scheduler service
职责：
- 按固定时间触发数据刷新
- 记录任务状态到 task_run_log

## 7. 数据对象与字段口径

## 7.1 raw_market_data
原始第三方返回数据。
- id: bigint pk
- source: varchar(32)
- symbol: varchar(16)
- payload_json: json
- fetched_at: datetime
- status: enum(success,failed)
- error_message: varchar(512)
- created_at: datetime

## 7.2 normalized_market_snapshot
标准化后的日线行情。
- id: bigint pk
- symbol: varchar(16)
- trade_date: date
- open: decimal(18,6)
- high: decimal(18,6)
- low: decimal(18,6)
- close: decimal(18,6)
- volume: decimal(18,2) null
- source: varchar(32)
- version: varchar(64)
- created_at: datetime

唯一索引：
- uk_symbol_date_version(symbol, trade_date, version)

## 7.3 indicator_snapshot
指标结果快照。
- id: bigint pk
- symbol: varchar(16)
- trade_date: date
- rsi14: decimal(10,4) null
- stoch_k: decimal(10,4) null
- stoch_d: decimal(10,4) null
- cci20: decimal(10,4) null
- adx14: decimal(10,4) null
- plus_di14: decimal(10,4) null
- minus_di14: decimal(10,4) null
- ao: decimal(10,4) null
- mom10: decimal(10,4) null
- created_at: datetime

唯一索引：
- uk_symbol_date(symbol, trade_date)

## 7.4 insight_summary
摘要结果（面向中台与页面解释）。
- id: bigint pk
- symbol: varchar(16)
- summary_title: varchar(128)
- summary_text: text
- drivers_json: json
- tags_json: json
- source_refs_json: json
- created_at: datetime

## 7.5 prediction_result
预测结果。
- id: bigint pk
- symbol: varchar(16)
- user_query: varchar(512)
- horizon: varchar(16)
- direction: enum(bullish,bearish,neutral)
- confidence: decimal(5,4)
- rationale_json: json
- risk_notes_json: json
- model_version: varchar(64)
- data_snapshot_refs_json: json
- created_at: datetime

## 7.6 task_run_log
任务日志。
- id: bigint pk
- task_type: varchar(64)
- status: enum(running,success,failed)
- input_ref_json: json
- output_ref_json: json
- started_at: datetime
- finished_at: datetime null
- error_message: varchar(512) null
- created_at: datetime

## 8. 指标口径与计算规则
### 8.1 RSI(14)
- 使用收盘价计算涨跌幅
- RSI = 100 - 100/(1+RS)
- 信号：
  - RSI < 30 且上拐：buy
  - RSI > 70 且下拐：sell
  - 其他：neutral

### 8.2 Stochastic %K(14,3,3)
- 原始%K = 100*(C-L14)/(H14-L14)
- 最终%K = 最近3期原始%K均值
- 信号：
  - %K < 20：buy
  - %K > 80：sell
  - 其他：neutral

### 8.3 CCI(20)
- TP=(H+L+C)/3
- CCI=(TP-MA20)/(0.015*MD)
- 信号：
  - CCI < -100：buy
  - CCI > 100：sell
  - 其他：neutral

### 8.4 ADX(14)
- 用于趋势强弱判定
- ADX > 25 视为趋势有效
- +DI / -DI 用于趋势方向修正

### 8.5 AO
- AO = SMA(MP,5)-SMA(MP,34), MP=(H+L)/2
- AO > 0 且上升：buy
- AO < 0 且下降：sell

### 8.6 MOM(10)
- MOM = C(t)-C(t-10)
- MOM > 0：buy
- MOM < 0：sell

## 9. 信号融合规则（一期）
### 9.1 基础打分
- buy = +1
- sell = -1
- neutral = 0

总分 = RSI + Stoch + CCI + AO + MOM

### 9.2 ADX 修正
- 若 ADX > 25，则总分 × 1.2
- 若 ADX <= 20，则总分 × 0.8

### 9.3 结论映射
- 总分 >= 2：bullish
- 总分 <= -2：bearish
- 其他：neutral

### 9.4 置信度映射
- confidence = min(1, abs(总分)/5)

### 9.5 依据生成
rationale 至少包含：
- 触发信号的 2~4 个关键指标
- ADX 趋势判断说明

riskNotes 至少包含：
- 指标滞后风险
- 事件冲击风险

## 10. API 契约
统一前缀：`/api/v1`

## 10.1 健康检查
GET `/health`

Response:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "service": "exchange-rate-forecaster",
    "time": "2026-05-02T10:00:00.000Z"
  }
}
```

## 10.2 手动刷新数据
POST `/api/v1/data/refresh`

Request:
```json
{
  "symbol": "USDCNH",
  "source": "alpha_vantage"
}
```

Response:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": 1024,
    "status": "success",
    "snapshotCount": 100
  }
}
```

## 10.3 导入 Excel 数据
POST `/api/v1/files/import`

Request:
```json
{
  "filePath": "./USDCNH-BBG-20Days.xlsx",
  "symbol": "USDCNH"
}
```

Response:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": 1025,
    "inserted": 20
  }
}
```

## 10.4 获取大盘数据
GET `/api/v1/dashboard/latest?symbol=USDCNH`

Response:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "symbol": "USDCNH",
    "lastUpdatedAt": "2026-05-02T10:00:00.000Z",
    "series": [
      {
        "tradeDate": "2026-04-30",
        "open": 7.251,
        "high": 7.266,
        "low": 7.24,
        "close": 7.259
      }
    ],
    "indicators": {
      "rsi14": 43.21,
      "stochK": 32.5,
      "cci20": -45.2,
      "adx14": 24.1,
      "ao": -0.0031,
      "mom10": 0.012
    },
    "latestPrediction": {
      "direction": "neutral",
      "confidence": 0.46,
      "horizon": "T+2"
    }
  }
}
```

## 10.5 发起预测问答
POST `/api/v1/predictions/query`

Request:
```json
{
  "symbol": "USDCNH",
  "question": "未来2天偏升还是偏贬？",
  "horizon": "T+2"
}
```

Response:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "direction": "bullish",
    "confidence": 0.72,
    "rationale": [
      "RSI从超卖区回升",
      "AO由负转正",
      "ADX大于25且+DI高于-DI"
    ],
    "riskNotes": [
      "技术指标存在滞后性",
      "突发政策事件可能导致失效"
    ],
    "sourceRefs": ["alpha_vantage"],
    "generatedAt": "2026-05-02T10:00:00.000Z",
    "snapshotVersion": "USDCNH-20260502-1"
  }
}
```

## 10.6 查询历史
GET `/api/v1/history/predictions?symbol=USDCNH&page=1&pageSize=20`
GET `/api/v1/history/tasks?taskType=data_refresh&page=1&pageSize=20`

## 10.7 统一错误结构
```json
{
  "code": 40001,
  "message": "invalid symbol",
  "data": null,
  "requestId": "req_xxx"
}
```

错误码建议：
- 40001 参数错误
- 40002 文件不存在/不可读
- 50001 第三方数据源调用失败
- 50002 指标计算失败
- 50003 预测生成失败
- 50004 数据库写入失败

## 11. 前端研发方案（Vue3 + Element Plus）
## 11.1 页面信息架构
- `/dashboard`：主工作台
- `/history/predictions`：预测历史页
- `/history/tasks`：任务日志页

## 11.2 组件拆分
- DashboardHeader（币对、更新时间、刷新）
- ChatPanel（问题输入、结果输出）
- MarketChartCard（行情图）
- IndicatorCardGroup（指标卡）
- PredictionCard（最新预测）
- HistoryTable（历史列表）

## 11.3 状态管理
建议 Pinia：
- marketStore：行情、指标、更新时间
- predictionStore：问答输入、预测结果
- taskStore：任务状态与历史

## 11.4 交互流程
1. 页面加载：拉取 dashboard/latest
2. 点击刷新：调用 data/refresh，成功后自动刷新 dashboard
3. 提交问题：调用 predictions/query，渲染结构化结果
4. 历史页：分页请求 history 接口

## 11.5 前端异常态
- 无数据：展示空态 + 导入/刷新引导
- 接口失败：展示错误提示和重试按钮
- 预测中：按钮 loading + 占位结果

## 12. 后端研发方案（Node.js + MySQL）
## 12.1 目录建议
```text
server/
  src/
    app.ts
    routes/
    controllers/
    services/
      market-data/
      file-ingestion/
      indicators/
      prediction/
      history/
      scheduler/
    repositories/
    schemas/
    utils/
    types/
  prisma/
    schema.prisma
```

## 12.2 分层约束
- Controller：参数校验 + 出参包装
- Service：业务逻辑
- Repository：数据库访问
- Provider：第三方 API 调用

## 12.3 第三方接入约束
- API key 仅后端使用
- 加入调用频率限制
- 第三方返回先做 schema 校验

## 13. 前后端字段映射表

| 前端字段 | 后端字段 | 数据表字段 |
|---|---|---|
| symbol | symbol | normalized_market_snapshot.symbol |
| tradeDate | trade_date | normalized_market_snapshot.trade_date |
| open/high/low/close | open/high/low/close | normalized_market_snapshot.* |
| rsi14 | rsi14 | indicator_snapshot.rsi14 |
| adx14 | adx14 | indicator_snapshot.adx14 |
| direction | direction | prediction_result.direction |
| confidence | confidence | prediction_result.confidence |
| rationale | rationale_json | prediction_result.rationale_json |
| riskNotes | risk_notes_json | prediction_result.risk_notes_json |

## 14. 联调清单
### 14.1 联调顺序
1. `/health`
2. `/api/v1/files/import`
3. `/api/v1/dashboard/latest`
4. `/api/v1/predictions/query`
5. `/api/v1/history/predictions`

### 14.2 联调检查点
- 出参字段命名与类型一致
- 空值场景返回一致
- 分页结构一致（page/pageSize/total/list）
- 时间字段统一 ISO 8601

### 14.3 Mock 数据要求
- 至少 20 条日线行情
- 至少 5 条历史预测
- 至少 3 条失败任务日志（用于异常态验证）

## 15. 配置与环境变量

```env
NODE_ENV=development
PORT=3001
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=exchange_rate_forecaster
ALPHA_VANTAGE_API_KEY=xxxxx
DEFAULT_SYMBOL=USDCNH
DEFAULT_HORIZON=T+2
CRON_REFRESH="0 18 * * 1-5"
```

## 16. 安全与审计要求
1. 不在前端暴露 API Key
2. 所有写接口记录 requestId 与操作者
3. 外部入参做白名单校验
4. 日志脱敏，不打印密钥

## 17. 测试方案
## 17.1 单元测试
- 指标计算函数（RSI/Stoch/CCI/ADX/AO/MOM）
- 融合规则映射函数
- 数据映射函数（Alpha -> 内部格式）

## 17.2 集成测试
- 数据刷新全链路
- 预测问答全链路
- Excel 导入全链路

## 17.3 前端测试
- 关键交互（刷新、提问、查看历史）
- 空态与错误态渲染

## 17.4 回归场景
- API 不可用时 Excel 回退
- 指标计算缺样本时降级提示
- 历史分页边界

## 18. 性能指标（一期目标）
- dashboard/latest 响应 P95 < 800ms
- predictions/query 响应 P95 < 1200ms
- 数据刷新任务（100条）< 5s

## 19. 里程碑计划（研发视角）
### M1：基础能力
- 建库建表
- 数据抓取与导入
- 大盘接口

### M2：预测能力
- 指标计算
- 规则融合
- 预测接口

### M3：工作台能力
- Vue 页面搭建
- 联调通过
- 历史记录与任务日志展示

### M4：稳定性
- 调度与日志
- 异常处理完善
- 验收与发布

## 20. 验收标准（研发交付）
1. 一键启动可运行（前后端 + MySQL）。
2. 可通过 API 拉取/导入数据并生成预测。
3. 页面可完成提问、查看图表、查看历史。
4. 每条预测具备“结论+依据+风险+可追溯字段”。
5. 基础异常场景可观测、可定位。

## 21. 风险与应对
1. Alpha 调用受限：
   - 应对：缓存 + Excel 回退 + 手动触发。
2. 指标信号冲突：
   - 应对：统一打分与阈值，输出中立结论。
3. 事件冲击导致预测失真：
   - 应对：强制风险提示，后续接入事件因子。
4. 字段口径不一致：
   - 应对：统一 schema 与联调清单强校验。

## 22. 研发启动清单（可直接执行）
1. 初始化前后端工程（Vue/Node）
2. 建立 MySQL 数据库与表结构
3. 实现 Alpha Provider + Excel Ingestion
4. 实现指标计算模块
5. 实现预测融合模块
6. 打通 6 个核心 API
7. 完成前端三页联调
8. 完成验收与发布准备

---

本 TRD 作为研发对接主文档，后续若有策略参数调整、指标新增、接口变更，需同步更新本文件并标注版本变更记录。
