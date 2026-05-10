# vnpy量化算法方案

## 1. 文档目的

本文档用于梳理“汇率量化策略和 AI 预判”能力的一期接入方案，重点回答以下问题：

1. 如何参考 vnpy 的思路完成汇率历史数据获取。
2. 如何为当前项目设计对应的数据源解析器与标准化流程。
3. 如何把现有量化算法升级为可插拔策略层，并与 AI 预测链路衔接。
4. 一期是否应该直接引入 vnpy 运行时，还是借鉴其抽象在当前项目内原生实现。

说明：仓库中存在 [汇率预测机PRD-1.md](./汇率预测机PRD-1.md)；未找到“汇率预测机TRD-1.md”，本方案同时参考现有 [汇率预测机TRD.md](./汇率预测机TRD.md) 与当前代码实现。

## 2. 背景与目标

### 2.1 产品目标

根据 [汇率预测机PRD-1.md](./汇率预测机PRD-1.md)，当前产品目标是构建一个面向 USD/CNH 的智能分析平台，核心能力包括：

- 多源行情数据自动采集、清洗、归一化。
- 量化信号计算与综合评分。
- AI 大模型结合技术面、量化面、消息面给出结构化分析。
- 通过 Web 和 Admin 为用户提供可追溯的预测历史、量化结果和任务状态。

### 2.2 一期非目标

本期不包含以下范围：

- 券商/交易所真实下单。
- 实时 tick 级交易事件驱动。
- 多币种、多资产统一交易平台。
- 完整账户、持仓、订单、成交撮合系统。

因此，本项目当前最优方向不是“把 vnpy 整套交易平台接进来”，而是“借鉴 vnpy 的数据与策略抽象，建设适合当前 Node/TypeScript 产品形态的汇率研究引擎”。

## 3. 当前项目基线

### 3.1 已有能力

当前项目已经具备汇率量化与预测的基础骨架：

- 行情数据表：`RawMarketData`、`NormalizedMarketSnapshot`。
- 预测结果表：`PredictionResult`。
- 量化快照表：`QuantSignalSnapshot`。
- 多源量化数据聚合：`server/src/services/quant/dataAggregator.ts`。
- 量化结果计算与落库：`server/src/services/quant/quantEngine.ts`。
- 7 个算法合成评分：`server/src/services/quant/compositeScorer.ts`。
- 规则型预测生成：`server/src/services/prediction/engine.ts`。
- AI 对话上下文注入量化结论：`server/src/services/ai/chatService.ts`。

### 3.2 当前代码中的关键问题

#### 3.2.1 数据双轨

当前量化引擎直接通过 `fetchBars(symbol, days)` 从外部源抓取临时 bars，再计算综合评分；但 Dashboard、预测、AI 上下文读取的是 `NormalizedMarketSnapshot`。这意味着：

- 量化层与页面层不一定基于同一份数据。
- 同一时间点上，AI 读到的行情与量化评分使用的行情可能不一致。
- 数据问题难以排查与复现。

#### 3.2.2 synthetic OHLC 风险

Frankfurter 与 ECB 当前都不提供真实 OHLC，代码中通过 close 近似生成 synthetic OHLC。该数据对趋势类指标尚可勉强使用，但会直接影响：

- Bollinger Bands
- Volatility Regime
- Support/Resistance
- Mean Reversion

如果不显式标注并降权，量化结果会被低质量 K 线放大误差。

#### 3.2.3 策略层仍为硬编码组合

当前 `compositeScorer.ts` 直接写死了 7 个算法调用顺序与权重映射，缺少：

- 策略注册表
- 统一策略输入输出协议
- 回测评估闭环
- 版本管理与实验沉淀

#### 3.2.4 AI 消费量化结果的方式仍偏文本拼装

当前 `chatService.ts` 通过 `buildQuantSection` 将综合评分、市场状态和部分信号拼成一段文本注入 RAG 上下文，这适合一期快速可用，但不利于：

- 更细粒度的策略解释。
- AI 输出一致性校验。
- 量化层与 AI 层的结构化解耦。

## 4. 外部方案调研结论

### 4.1 参考资料

本方案综合参考以下内容：

- 掘金文章 1：量化开源项目推荐，覆盖 vnpy、Qbot、QUANTAXIS、ABU、Zipline 等。
- 掘金文章 2：常见量化策略，涵盖趋势跟踪、均值回归、动量、统计套利、多因子等。
- GitHub 仓库：`vnpy/vnpy`。

### 4.2 选型结论

#### 结论一：一期不建议直接把 vnpy 作为主运行时

原因如下：

- 当前主系统是 Node/TypeScript + Prisma + Fastify + Vue，不是 Python 桌面交易平台。
- 当前目标是“研究、预判、AI 分析”，不是“交易执行、订单管理、网关接入”。
- vnpy 的 gateway、event engine、order/trade/position 等交易运行时能力，对本项目当前阶段是额外复杂度。

#### 结论二：vnpy 非常适合作为设计参考

最值得借鉴的 vnpy 能力包括：

- `query_history` 风格的历史数据请求抽象。
- `BarData` 风格的统一 K 线对象。
- `HistoryRequest` 风格的数据查询对象。
- `CTA Strategy Template` 风格的策略模板设计。
- `Backtesting` 风格的历史重放与策略评估框架。

#### 结论三：当前项目一期最优解

推荐采用以下方案：

`Node 原生研究引擎 + 借鉴 vnpy 抽象 + 可选 Python sidecar`

具体含义：

- Node 主服务继续负责数据采集、标准化、任务调度、数据库落库、API、AI 编排。
- 在当前项目中原生实现 `HistoryRequest`、`FxBar`、`Strategy`、`StrategyRun` 等抽象。
- 如果后续需要更重的离线回测、walk-forward、参数搜索，可增加 Python sidecar，用于研究任务而非在线主链路。

### 4.3 与候选框架的对比

| 方案 | 适配度 | 结论 |
|------|--------|------|
| vnpy | 高 | 最适合借鉴抽象和策略研究思路，但不建议一期整套接入运行时 |
| backtrader | 中高 | 适合做轻量 Python 回测 sidecar，可作为次选 |
| qlib | 中 | 更偏多资产/ML 因子研究，对当前单品种 FX 一期偏重，不建议优先 |

## 5. 总体架构建议

## 5.1 目标架构

建议将一期架构拆为四层：

1. FX 数据底座层
2. 量化策略层
3. 评分与评估层
4. AI 消费层

### 5.2 分层职责

#### 5.2.1 FX 数据底座层

职责：

- 对接 Yahoo、Frankfurter、ECB 等源。
- 统一 symbol 映射。
- 解析 payload 并标准化为统一 FxBar。
- 标记 synthetic、质量分、版本号。
- 写入 RawMarketData 与 NormalizedMarketSnapshot。

#### 5.2.2 量化策略层

职责：

- 基于统一 FxBar 输入运行趋势、均值回归、动量等策略。
- 输出统一结构化策略信号。
- 支持策略注册、策略版本、适用市场状态声明。

#### 5.2.3 评分与评估层

职责：

- 根据 regime 组合多个策略输出。
- 产出 `-100 ~ +100` 综合评分。
- 记录 composite score、置信度、top strategies。
- 提供最小回测与命中率评估。

#### 5.2.4 AI 消费层

职责：

- 将最新行情、技术指标、量化信号、新闻摘要、历史预测整合为结构化上下文。
- 让 AI 基于结构化量化输出生成结论，而不是只消费自然语言拼接段落。

## 6. vnpy 相关抽象如何映射到当前项目

### 6.1 历史数据请求抽象

参考 vnpy 的 `query_history(HistoryRequest)` 思路，当前项目建议引入统一请求对象：

```ts
interface HistoryRequest {
  symbol: string
  interval: "1h" | "4h" | "1d"
  start?: Date
  end?: Date
  limit?: number
  preferredSources?: string[]
  allowSynthetic?: boolean
  minQualityScore?: number
}
```

使用收益：

- 统一 Dashboard、量化引擎、预测引擎、AI 上下文取数口径。
- 避免当前 `symbol + days` 与 `symbol + limit` 混用。
- 为后续 Python sidecar 提供标准调用协议。

### 6.2 统一 FxBar 对象

参考 vnpy 的 `BarData`，建议在当前项目内统一为：

```ts
interface FxBar {
  symbol: string
  interval: "1h" | "4h" | "1d"
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume?: number
  source: string
  isSynthetic: boolean
  qualityScore: number
  version: string
}
```

当前 `OhlcBar` 与 `QuantBar` 可逐步收口到一个统一对象，减少转换层和口径偏差。

### 6.3 策略模板抽象

参考 vnpy 的 CTA Strategy Template，但针对本项目做研究化裁剪：

```ts
interface QuantStrategy {
  key: string
  displayName: string
  version: string
  supportedIntervals: Array<"1h" | "4h" | "1d">
  supportsSynthetic: boolean
  supportedRegimes?: string[]
  evaluate(context: StrategyContext): Promise<StrategySignal>
}
```

本项目中策略只负责输出研究信号，不包含：

- buy/sell/short/cover
- 订单回报
- 持仓同步
- 交易网关调用

## 7. 汇率数据获取方案

### 7.1 一期目标

一期只聚焦 `USDCNH`，但设计时保留扩展到 `USDCNY`、`EURUSD`、`GBPUSD`、`USDJPY` 的能力。

### 7.1.1 标的语义与代理策略

当前产品语义是 `USDCNH`，但现有代码中的多个行情源实际使用的是 `CNY` 代理数据。因此，一期方案必须显式区分“产品标的”和“源标的”。

建议在数据模型和标准化对象中明确以下语义字段：

- `canonicalSymbol`：产品统一标的，例如 `USDCNH`
- `sourceSymbol`：数据源真实请求标的，例如 Yahoo 的 `CNY=X`
- `proxyFor`：当源不支持 CNH 时，标记该数据是哪个标的的代理
- `basisRiskLevel`：`low | medium | high`

一期建议采用以下代理策略：

| canonicalSymbol | source | sourceSymbol | 是否代理 | basisRiskLevel | 说明 |
|----------------|--------|--------------|----------|----------------|------|
| USDCNH | Yahoo | CNY=X | 是 | medium | 作为主源可接受，但必须披露为 CNH 的代理 |
| USDCNH | Frankfurter | USD/CNY | 是 | high | 仅作为 fallback，默认低质量 |
| USDCNH | ECB | EUR 交叉换算 USD/CNY | 是 | high | 最低优先级，只作兜底参考 |

规则要求：

- 任何代理数据必须带 `basisRiskLevel`
- AI 分析和量化快照在引用代理数据时，必须能够追溯到 `sourceSymbol`
- 当 `basisRiskLevel = high` 时，不得输出“高置信度真实 CNH 结论”

### 7.2 数据源优先级

建议沿用当前多源容灾思路，但重构为“适配器注册 + 历史查询服务”：

1. Yahoo Finance
2. Frankfurter
3. ECB

原因：

- Yahoo 更接近真实市场行情结构，可提供真实 OHLC。
- Frankfurter 与 ECB 更适合作为 close-only fallback。
- ECB 只应作为兜底源，不应承担高频技术分析主源。

### 7.3 数据获取职责分解

每个数据源适配器建议拆成 5 个步骤：

1. `mapSymbol(symbol)`
2. `fetchRaw(request)`
3. `parsePayload(raw)`
4. `normalizeBars(parsed)`
5. `assessQuality(bars)`

### 7.3.1 统一粒度、唯一键与回填策略

Phase 1 必须先定义 canonical grain，否则无法稳定替换当前“量化直抓、页面读库”的双轨模式。

建议如下：

- 一期 canonical grain 统一为 `1d`，直接落库到 `NormalizedMarketSnapshot`
- `1h` 与 `4h` 在一期继续通过统一 repository 从标准化数据派生，不单独作为主事实源落库
- 只有在未来接入稳定小时级 FX 源后，再考虑为 `1h` / `4h` 建立独立持久化层

建议的唯一性策略为：

- `canonicalSymbol + interval + snapshotDate + version`

建议的 `version` 组成：

- `sourceFamily + normalizerVersion + datasetDate`

建议的迁移方式：

1. 保留现有 `NormalizedMarketSnapshot` 读写逻辑，不立即下线
2. 新增统一 repository 和 adapter 层后，进入双写期
3. 对比旧链路与新链路的 bars 数量、最后收盘价、最新版本号和 quality 标签
4. 偏差稳定在阈值内后，再切换 Quant、Dashboard、Prediction、AI 全量读取统一 repository

建议的回填策略：

- 至少回填最近 180 到 365 个交易日
- 回填时同步写入 `isSynthetic`、`qualityScore`、`sourceTraceJson`
- 任何回填任务都必须记录到 `TaskRunLog`

### 7.4 数据质量规则

建议增加以下规则：

- 真实 OHLC：`qualityScore = 1.0`
- close 推导 synthetic OHLC：`qualityScore = 0.4 ~ 0.6`
- 交叉汇率推导 close：`qualityScore = 0.2 ~ 0.4`
- bars 数量低于策略最小窗口：直接拒绝进入量化分析

### 7.5 原始与标准数据落库策略

建议继续使用现有表，但补充字段：

#### RawMarketData

保留原始 payload，用于：

- 追溯源问题
- 重放与复查
- 调试解析器

建议补充字段：

- requestUrl
- responseStatus
- datasetVersion

#### NormalizedMarketSnapshot

建议补充字段：

- interval
- isSynthetic
- qualityScore
- sourceTraceJson
- canonicalSymbol
- sourceSymbol
- proxyFor
- basisRiskLevel

这样可以让所有后续模块直接使用标准化、可追溯、可分级的数据。

## 8. 数据源解析器设计

### 8.1 解析器接口

建议新增统一接口：

```ts
interface FxDataSourceAdapter {
  name: string
  priority: number
  supports(symbol: string): boolean
  queryHistory(request: HistoryRequest): Promise<FxBar[]>
}
```

### 8.2 一期适配器清单

#### 8.2.1 YahooFxAdapter

职责：

- 将 `USDCNH` 映射到 Yahoo 对应 symbol。
- 获取真实历史 OHLC。
- 作为主源提供日线研究数据。

#### 8.2.2 FrankfurterFxAdapter

职责：

- 获取 base/target 汇率 close。
- 生成 close-only fallback bars。
- 明确标记 `isSynthetic = true`。

#### 8.2.3 EcbFxAdapter

职责：

- 作为最终兜底源。
- 仅在主源和次源失败时启用。
- 默认只为低权重策略和 AI 提供参考，不建议支撑所有波动率类策略。

### 8.3 解析器注册方式

建议从当前 `sources: SourceEntry[]` 升级为注册表：

```ts
const fxDataSourceRegistry: FxDataSourceAdapter[] = [
  yahooAdapter,
  frankfurterAdapter,
  ecbAdapter,
]
```

并将当前熔断机制保留在统一 orchestrator 中，而不是散落到每个 source 文件里。

## 9. 算法策略接入方案

### 9.1 一期策略范围

结合当前代码与外部策略资料，一期建议优先接入以下三类主策略：

1. 趋势跟踪
2. 均值回归
3. 动量

当前项目已有 7 个算法，可映射如下：

| 当前算法 | 策略归类 | 一期定位 |
|---------|----------|----------|
| maCrossover | 趋势跟踪 | 保留 |
| macd | 趋势跟踪/动量 | 保留 |
| momentum | 动量 | 保留 |
| meanReversion | 均值回归 | 保留 |
| bollingerBands | 均值回归/波动率 | 保留，但对 synthetic bar 降权 |
| supportResistance | 价位结构 | 保留，增强解释性 |
| volatilityRegime | 风险状态 | 保留，用于 regime 与权重调度 |

### 9.2 一期暂缓策略

以下策略建议先不进入主链路：

- 统计套利：当前只有单品种 USDCNH，不适合一期。
- 多因子 ML：需要更稳定的特征层和评估体系，放到后续阶段。
- 高频策略：不符合产品边界。

### 9.3 策略输出统一协议

建议所有策略统一输出：

```ts
interface StrategySignal {
  strategyKey: string
  strategyVersion: string
  score: number
  confidence: number
  direction: "bullish" | "bearish" | "neutral"
  rationale: string[]
  evidence: Record<string, number | string>
  dataQualityImpact: number
}
```

### 9.4 策略编排方式

建议将当前 `compositeScorer.ts` 重构为三层：

1. `strategyRegistry`
2. `strategyRunner`
3. `compositeScorer`

职责如下：

- `strategyRegistry`：注册可用策略。
- `strategyRunner`：逐个执行策略并统一异常处理。
- `compositeScorer`：基于 regime 与质量分加权得到综合评分。

### 9.5 regime-aware 加权机制

当前已有 `REGIME_WEIGHTS`，建议保留思路并增强：

- 将权重由常量表提升为配置化对象。
- 引入 `qualityScore` 对最终权重做二次修正。
- 对 synthetic-only 数据下的某些策略直接降权或禁用。

例如：

- `volatilityRegime` 在 synthetic 数据上只能作为低置信度参考。
- `supportResistance` 若高低点不可信，应下调权重。
- `maCrossover` 与 `momentum` 对 close-only 数据的容忍度更高。

## 10. 综合评分与量化快照方案

### 10.1 综合评分定义

保留现有产品目标：输出 `-100 ~ +100` 的综合评分。

建议公式拆解为：

1. 单策略 score 标准化到 `[-100, 100]`
2. 根据 regime 取权重
3. 根据 `qualityScore` 做质量折损
4. 根据策略一致性得到全局 confidence

### 10.2 量化快照内容

建议 `QuantSignalSnapshot` 后续至少包含：

- compositeScore
- regime
- confidence
- topStrategies
- dataQualitySummary
- strategyVersionMap
- datasetVersion

### 10.2.1 PredictionResult 与量化证据绑定

当前预测入口实际发生在 `dashboardService.runPrediction`，并最终落到 `PredictionResult`。因此，TRD 必须要求预测结果显式绑定量化证据，而不是只保存技术指标快照。

建议为 `PredictionResult` 增加以下字段：

- `quantSignalSnapshotId`
- `quantDatasetVersion`
- `quantEvidenceJson`
- `strategyRunRefs`

绑定规则：

1. 每次生成预测时，必须记录当次引用的量化快照 ID
2. 如果预测直接消费的是结构化 `QuantBundle`，则至少要落 `quantDatasetVersion`
3. 如果预测引用了单策略结论，还需保留 `strategyRunRefs`

这样后续才能回答三个关键问题：

- 某次 AI 预测用了哪一版量化结果
- 某次量化快照是否真的提升了预测命中率
- 某个策略版本升级后，历史预测表现是否变化

### 10.3 新增建议表

建议新增以下研究表：

#### StrategyDefinition

记录：

- strategyKey
- displayName
- version
- paramsSchema
- status

#### StrategyRun

记录：

- strategyKey
- symbol
- horizon
- score
- confidence
- evidenceJson
- datasetVersion
- runAt

#### BacktestRun

记录：

- strategyKey
- sampleWindow
- horizon
- hitRate
- avgReturn
- maxDrawdown
- artifactRef

#### ForecastEvaluation

记录：

- predictionId
- realizedDirection
- realizedReturnBp
- evaluationStatus

这些表能解决当前系统“有结论、少闭环”的问题。

## 11. AI 预判集成方案

### 11.1 当前 AI 集成方式

当前 `chatService.ts` 已具备：

- 最近行情注入
- 技术指标注入
- 历史预测注入
- 新闻摘要注入
- 最新量化快照注入

这条链路不应推倒重来。

但需要补一条强约束：AI 注入的量化内容必须能够回溯到 `QuantSignalSnapshot` 或 `QuantBundle.datasetVersion`，否则无法和 `PredictionResult`、`ForecastEvaluation` 形成完整闭环。

### 11.2 建议升级方向

建议新增结构化量化上下文对象 `QuantBundle`：

```ts
interface QuantBundle {
  symbol: string
  horizon: string
  latestBar: FxBar
  regime: string
  compositeScore: number
  confidence: number
  topSignals: StrategySignal[]
  dataQuality: {
    overallScore: number
    syntheticRatio: number
  }
  recentPerformance?: {
    hitRate7d?: number
    hitRate30d?: number
  }
}
```

AI 层应优先消费 `QuantBundle`，而不是只消费自然语言段落。

### 11.3 AI 报告结构建议

AI 输出建议固定为：

1. 结论
2. 技术面
3. 量化面
4. 消息面参考
5. 风险提示

这样可保证量化层升级后，AI 仍能稳定使用统一结构。

### 11.4 在线链路边界

不建议把重回测和参数搜索放入用户同步请求链路。在线 AI 只读取：

- 最新有效量化快照
- 最近评估摘要
- 最新新闻摘要

更重的研究任务应交给异步任务或 Python sidecar。

## 12. Python sidecar 建议边界

### 12.1 适合放 sidecar 的能力

- walk-forward 回测
- 参数搜索
- 批量研究任务
- 试验性 ML 模型
- 使用 Python 量化框架快速验证策略原型

### 12.2 不适合放 sidecar 的能力

- 在线最新行情主链路
- Dashboard 主数据接口
- 用户同步 AI 对话上下文构建
- 主数据库事实源

### 12.3 推荐边界

建议保持：

- Node 是事实源与主编排器。
- sidecar 是研究计算器。

调用方式：

- `POST /internal/research/analyze`
- `POST /internal/research/backtests`
- `GET /internal/research/jobs/:id`

Node 拿到结果后统一入库并对外提供 API。

## 13. 分阶段实施计划

## 13.1 Phase 1：统一 FX 数据底座

### 目标

建立一套可复用的历史汇率数据底座，统一行情口径。

### 交付物

- `HistoryRequest` 与统一 `FxBar` 对象
- 数据源适配器注册层
- 原始 payload 与标准化 bars 双层落库
- 数据质量标记与 synthetic 降级规则

### 涉及模块

- `server/src/services/quant/dataAggregator.ts`
- `server/src/services/quant/sources/*`
- `server/src/services/dashboard/dashboardService.ts`
- `prisma/schema.prisma`

### 验收标准

- Dashboard、Prediction、Quant 三条链路使用同一份标准化 bar 数据。
- 任意一次量化计算都可追溯到来源、版本和质量等级。
- Frankfurter/ECB 的 synthetic bars 不再被误当成真实 OHLC。
- `USDCNH` 与各源 `sourceSymbol` 的代理关系可查询、可披露。
- 双写期内旧新链路的最新 close 偏差和样本覆盖率可被校验。

## 13.2 Phase 2：重构策略层与综合评分层

### 目标

将当前硬编码 7 算法升级为可插拔策略体系，并建立最小回测闭环。

### 交付物

- 策略注册表
- 统一 `StrategySignal`
- regime-aware + quality-aware 综合评分器
- 基础回测/命中率评估脚本或服务

### 涉及模块

- `server/src/services/quant/algorithms/*`
- `server/src/services/quant/compositeScorer.ts`
- `server/src/services/quant/quantEngine.ts`
- 新增研究表

### 验收标准

- 7 个现有算法均能以统一接口运行。
- 可输出单策略结果与综合评分。
- 可对 T+1/T+2/T+3 做基础效果回看。

## 13.3 Phase 3：接入 AI 预判与可选 sidecar

### 目标

把结构化量化结果稳定注入 AI，并为更重研究任务预留 Python sidecar。

### 交付物

- `QuantBundle` 结构化上下文
- AI 量化摘要升级
- 研究任务 internal API
- 可选的 Python sidecar 设计与任务协议

### 涉及模块

- `server/src/services/ai/chatService.ts`
- `server/src/services/prediction/engine.ts`
- `server/src/routes/quant.ts`
- 新增 `/internal/research/*`

### 验收标准

- AI 回答中可稳定引用最新量化评分、市场状态、top strategies 与风险因素。
- 重回测任务不阻塞用户同步请求。
- 主链路无需直接依赖 Python 运行时即可正常工作。

## 14. 具体开发清单建议

### 14.1 数据层

- 收口 `QuantBar` 与 `OhlcBar`。
- 新增 `HistoryRequest`。
- 改造 `fetchBars` 为 `queryHistory` 风格。
- 为每个源补齐质量评估。
- 为 `NormalizedMarketSnapshot` 补 interval、quality、synthetic 字段。
- 增加 `canonicalSymbol/sourceSymbol/proxyFor/basisRiskLevel` 语义字段。

### 14.2 策略层

- 新建 `strategyRegistry`。
- 为 7 个算法统一协议。
- 把组合评分器从硬编码改为注册表驱动。
- 增加策略版本号与实验记录。

### 14.3 评估层

- 新建基础回测指标。
- 输出 hit rate、方向分布、样本覆盖、数据质量影响。
- 建立 prediction 与 realized outcome 的闭环。
- 确保 `PredictionResult` 可回溯到 `quantSignalSnapshotId` 与 `quantDatasetVersion`。

### 14.4 AI 层

- 将 `buildQuantSection` 升级为结构化 `QuantBundle` 构造。
- 控制上下文长度，保留“最新结论 + top evidence + 风险摘要”。
- 对低质量数据明确提示。

## 15. 风险与规避

### 15.1 数据质量风险

风险：synthetic OHLC 导致策略偏差。

规避：

- 强制标记 `isSynthetic`。
- 对波动率、支撑阻力等策略降权。
- 评估报表中单独统计 synthetic 样本表现。

### 15.2 双事实源风险

风险：Node 与 sidecar 使用不同数据集版本。

规避：

- Node 作为唯一事实源。
- 所有研究任务传入 dataset version。
- sidecar 不直接维护主事实表。

### 15.3 过拟合风险

风险：单品种、小样本调权导致虚假高胜率。

规避：

- 一期只做最小评估闭环。
- 不提前引入复杂参数优化。
- 强制记录 sample window 与版本。

### 15.4 AI 幻觉风险

风险：AI 将量化结果错误扩展为未经验证的判断。

规避：

- AI 只消费结构化量化对象。
- 报告中区分“量化证据”和“语言解释”。
- 明确输出数据质量和风险提示。

## 16. 最终建议

本项目关于“汇率量化策略和 AI 预判”的一期最优方案，不是直接引入 vnpy 作为运行时，而是：

1. 参考 vnpy 的 `HistoryRequest`、`BarData`、策略模板、回测分层思想。
2. 在当前 Node/TypeScript 项目中原生实现统一 FX 数据底座与可插拔策略层。
3. 保留当前 Web/Admin/AI 主链路不变，先把数据与量化抽象做扎实。
4. 在需要更重研究任务时，再引入 Python sidecar，优先承担离线回测、参数扫描和实验性模型工作。

对当前主题“汇率量化策略和 AI 预判”而言，这是比直接把 vnpy 整套接入更稳、更小侵入、也更贴合现有项目结构的方案。
