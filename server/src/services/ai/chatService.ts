import { prisma } from "../../utils/db.js"
import { computeIndicatorSeriesFromConfig } from "../indicators/calculator.js"
import { computeSignalsFromConfig } from "../prediction/engine.js"
import { getLatestBars } from "../dashboard/dashboardService.js"
import { getLatestDigest } from "../news/index.js"
import { getFileAsBase64, extractTextFromFile, isImageMime } from "../file/fileService.js"
import { executeDataQuery, AVAILABLE_QUERIES } from "./dataQuery.js"
import { getLatestQuantSignal } from "../quant/quantEngine.js"
import { buildQuantBundle } from "../quant/enhancedQuantEngine.js"
import { buildStructuredQuantContext } from "../quant/quantContextBuilder.js"
import { buildApiToolDescription } from "./apiRegistry.js"
import type { OhlcBar, IndicatorValues, SignalResult } from "../../types/index.js"

const ABL_API_BASE_URL = process.env.ABL_API_BASE_URL ?? "https://api.ablai.top"
const ABL_API_TOKEN = process.env.ABL_API_TOKEN ?? ""
const ABL_MODEL_ID = "gpt-5.4-2026-03-05"

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | ContentPart[]
}

function formatIndicators(ind: IndicatorValues): string {
  const lines: string[] = []
  if (ind.rsi14 != null) lines.push(`RSI(14): ${ind.rsi14.toFixed(2)}`)
  if (ind.stochK != null) lines.push(`Stochastic %K: ${ind.stochK.toFixed(2)}`)
  if (ind.stochD != null) lines.push(`Stochastic %D: ${ind.stochD.toFixed(2)}`)
  if (ind.cci20 != null) lines.push(`CCI(20): ${ind.cci20.toFixed(2)}`)
  if (ind.adx14 != null) lines.push(`ADX(14): ${ind.adx14.toFixed(2)}`)
  if (ind.plusDi14 != null) lines.push(`+DI(14): ${ind.plusDi14.toFixed(2)}`)
  if (ind.minusDi14 != null) lines.push(`-DI(14): ${ind.minusDi14.toFixed(2)}`)
  if (ind.ao != null) lines.push(`AO: ${ind.ao.toFixed(4)}`)
  if (ind.mom10 != null) lines.push(`MOM(10): ${ind.mom10.toFixed(4)}`)
  return lines.join("\n")
}

function formatSignals(signals: SignalResult): string {
  return [
    `RSI信号: ${signals.rsi}`,
    `Stochastic信号: ${signals.stoch}`,
    `CCI信号: ${signals.cci}`,
    `AO信号: ${signals.ao}`,
    `MOM信号: ${signals.mom}`,
  ].join("\n")
}

function formatRecentBars(bars: OhlcBar[], count = 10): string {
  const recent = bars.slice(-count)
  return recent
    .map(
      (b) =>
        `${b.tradeDate instanceof Date ? b.tradeDate.toISOString().slice(0, 10) : b.tradeDate} | O:${b.open.toFixed(4)} H:${b.high.toFixed(4)} L:${b.low.toFixed(4)} C:${b.close.toFixed(4)}`
    )
    .join("\n")
}

async function getRecentPredictions(symbol: string, limit = 5) {
  return prisma.predictionResult.findMany({
    where: { symbol },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}

async function buildQuantSection(symbol: string, horizon: string): Promise<string> {
  try {
    const bundle = await buildQuantBundle(symbol, horizon)
    if (bundle) {
      return `\n\n${buildStructuredQuantContext(bundle)}`
    }

    const quant = await getLatestQuantSignal(symbol)
    if (!quant) return ""

    const dirLabel = quant.compositeScore > 20 ? "偏多" : quant.compositeScore < -20 ? "偏空" : "中性"
    const regimeLabel: Record<string, string> = {
      trending_up: "上升趋势",
      trending_down: "下降趋势",
      ranging: "震荡",
      volatile: "高波动",
    }

    const signals = (quant.signals as { name: string; score: number; description: string }[])
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 5)
      .map((s) => `- ${s.name}: ${s.score > 0 ? "+" : ""}${s.score.toFixed(0)} (${s.description})`)
      .join("\n")

    const age = Math.round((Date.now() - new Date(quant.createdAt).getTime()) / 60_000)

    return `\n\n## 量化引擎信号 (${age}分钟前更新)
综合评分: ${quant.compositeScore > 0 ? "+" : ""}${quant.compositeScore.toFixed(1)} / 100 (${dirLabel})
市场状态: ${regimeLabel[quant.regime] ?? quant.regime}
置信度: ${(quant.confidence * 100).toFixed(0)}%
主要信号:
${signals}`
  } catch {
    return ""
  }
}

export interface PageContext {
  pageName: string
  pageData?: string
}

export async function buildRAGContext(symbol: string, horizon: string, pageContext?: PageContext): Promise<string> {
  let bars: OhlcBar[] = []
  try {
    bars = await getLatestBars(symbol, 60)
  } catch {
    // database may not have interval column yet — graceful fallback
  }

  if (bars.length < 2) {
    const pageCtxStr = pageContext ? `\n\n## 当前用户页面上下文\n页面: ${pageContext.pageName}${pageContext.pageData ? `\n页面数据:\n${pageContext.pageData}` : ""}` : ""
    const quantSection = await buildQuantSection(symbol, horizon)
    if (quantSection) {
      return `数据不足，暂无K线行情数据。请使用 call_server_api 或 query_data 工具获取最新数据。${quantSection}${pageCtxStr}`
    }
    return `数据不足，暂无行情数据可供分析。请使用 query_data 工具查询数据，或使用 call_server_api 调用 GET /api/v1/dashboard/latest?symbol=USDCNH 获取最新行情。${pageCtxStr}`
  }

  const indSeries = await computeIndicatorSeriesFromConfig(bars)
  const latestInd = indSeries[bars.length - 1]
  const prevInd = indSeries[bars.length - 2]
  const signals = await computeSignalsFromConfig(latestInd, prevInd)

  const latestBar = bars[bars.length - 1]
  const latestDate =
    latestBar.tradeDate instanceof Date
      ? latestBar.tradeDate.toISOString().slice(0, 10)
      : latestBar.tradeDate

  const recentPreds = await getRecentPredictions(symbol, 5)
  const predHistory = recentPreds.length > 0
    ? recentPreds
      .map((p) => {
        const dir = p.direction === "bullish" ? "看多" : p.direction === "bearish" ? "看空" : "中性"
        return `[${p.createdAt.toISOString().slice(0, 10)}] ${p.horizon} ${dir} 置信度:${(p.confidence * 100).toFixed(0)}% 查询:"${p.userQuery}"`
      })
      .join("\n")
    : "暂无历史预测记录"

  let newsSection = ""
  try {
    const digest = await getLatestDigest(symbol === "USDCNH" ? "USDCNH" : symbol)
    if (digest) {
      const factors = (digest.keyFactors as { factor: string; direction: string; detail: string }[])
        .map((f) => `- ${f.factor} (${f.direction}): ${f.detail}`)
        .join("\n")
      const age = Math.round((Date.now() - new Date(digest.createdAt).getTime()) / 60_000)
      newsSection = `\n\n## 消息面摘要 (${age}分钟前更新)
标题: ${digest.headline}
综合情绪: ${digest.sentiment}
摘要: ${digest.summary}
关键因素:
${factors}`
    }
  } catch {
    // news digest unavailable — not critical
  }

  return `## 当前市场数据 (${symbol})
最新数据日期: ${latestDate}
最新收盘价: ${latestBar.close.toFixed(4)}
预测周期: ${horizon}

## 近10日行情
${formatRecentBars(bars, 10)}

## 最新技术指标
${formatIndicators(latestInd)}

## 技术信号判定
${formatSignals(signals)}

## 近期预测历史
${predHistory}${newsSection}${await buildQuantSection(symbol, horizon)}${pageContext ? `\n\n## 当前用户页面上下文\n页面: ${pageContext.pageName}${pageContext.pageData ? `\n页面数据:\n${pageContext.pageData}` : ""}` : ""}`
}

const SYSTEM_PROMPT = `你是一个专业的外汇市场分析助手，专注于USD/CNH（美元兑离岸人民币）汇率分析和预测。

你的职责：
1. 基于提供的实时行情数据和技术指标，给出专业的市场分析
2. 结合RSI、Stochastic、CCI、ADX、AO、MOM等技术指标进行综合研判
3. 结合量化引擎的综合评分和多因子策略信号，给出更全面的方向判断
4. 量化引擎包含7大策略：均线交叉、MACD、动量、均值回归、布林带、支撑阻力、波动率状态
5. 给出明确的方向判断（偏升/偏贬/震荡）和置信度评估
6. 解释分析逻辑，让用户理解判断依据
7. 如果有消息面摘要，在技术面分析之后附上简短的消息面解读作为辅助参考
8. 如果用户上传了图片或文件，结合上传内容和市场数据进行分析
9. 当用户询问历史数据、统计信息或需要查询数据库时，使用提供的数据查询工具获取数据
10. 注意数据质量标注：合成数据(isSynthetic)和代理数据(proxyFor)的策略结论需谨慎参考

分析规则：
- RSI < 30 且上拐 → 超卖反弹信号（偏多）
- RSI > 70 且下拐 → 超买回调信号（偏空）
- Stochastic %K < 20 → 超卖（偏多），> 80 → 超买（偏空）
- CCI < -100 → 偏多，> 100 → 偏空
- ADX > 25 表示趋势强劲，结合+DI/-DI判断方向
- ADX < 20 表示弱趋势/震荡，技术信号可信度降低
- AO 正值且上升 → 偏多，负值且下降 → 偏空
- MOM > 0 → 偏多，< 0 → 偏空
- 量化引擎综合评分 > +20 → 偏多，< -20 → 偏空，中间为中性
- 数据质量分 < 50% 时，策略结论仅供参考

回答要求：
- 使用中文回答
- 结构清晰，先给结论再展开分析
- 以技术面为主，消息面为辅。技术分析结束后，如有消息面数据，用"📰 消息面参考"小节简要概括（2-3句）
- 标注置信度和风险提示
- 不构成交易建议，仅作策略辅助参考
- 当需要查询更多数据时，主动使用 query_data 工具
- 当用户询问实时行情、最新量化分析、数据源状态等信息时，使用 call_server_api 工具调用服务端接口获取最新数据
- 如果上下文中的数据不足以回答用户问题，必须先调用工具获取数据再回答，不要凭空推测
- 可以组合使用多个工具调用来获取完整信息`

async function buildMultimodalUserContent(
  userMessage: string,
  attachmentIds: string[],
): Promise<string | ContentPart[]> {
  if (attachmentIds.length === 0) return userMessage

  const parts: ContentPart[] = [{ type: "text", text: userMessage }]
  const textParts: string[] = []

  for (const fileId of attachmentIds) {
    const fileData = await getFileAsBase64(fileId)
    if (!fileData) continue

    if (isImageMime(fileData.mimeType)) {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${fileData.mimeType};base64,${fileData.base64}` },
      })
    } else {
      const text = await extractTextFromFile(fileId)
      if (text) {
        textParts.push(`[附件内容]\n${text}`)
      }
    }
  }

  if (textParts.length > 0) {
    parts[0] = { type: "text", text: `${userMessage}\n\n${textParts.join("\n\n")}` }
  }

  return parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts
}

export async function buildChatMessages(
  userMessage: string,
  symbol: string,
  horizon: string,
  conversationHistory: { role: string; content: string }[] = [],
  attachmentIds: string[] = [],
  pageContext?: PageContext,
): Promise<ChatMessage[]> {
  const ragContext = await buildRAGContext(symbol, horizon, pageContext)

  const userContent = await buildMultimodalUserContent(userMessage, attachmentIds)

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content: `以下是当前检索到的市场数据和分析上下文：\n\n${ragContext}`,
    },
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userContent },
  ]

  return messages
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_data",
      description: "查询数据库中的市场数据、预测历史、指标值、新闻摘要、量化信号或统计信息。当需要获取数据来回答用户问题时，主动调用此工具。",
      parameters: {
        type: "object",
        properties: {
          query_type: {
            type: "string",
            enum: AVAILABLE_QUERIES.map((q) => q.name),
            description: AVAILABLE_QUERIES.map((q) => `${q.name}: ${q.description}`).join("; "),
          },
          params: {
            type: "object",
            description: "查询参数，根据 query_type 不同而不同",
          },
        },
        required: ["query_type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "call_server_api",
      description: buildApiToolDescription(),
      parameters: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE"],
            description: "HTTP 方法",
          },
          path: {
            type: "string",
            description: "API 路径，如 /api/v1/quant/bundle?symbol=USDCNH",
          },
          body: {
            type: "object",
            description: "请求体 (POST/PUT 时需要)",
          },
        },
        required: ["method", "path"],
      },
    },
  },
]

const SERVER_PORT = process.env.PORT ?? "4001"
const ALLOWED_API_PREFIXES = ["/api/v1/"]

async function executeServerApiCall(args: { method: string; path: string; body?: unknown }): Promise<string> {
  const { method, path, body } = args

  if (!ALLOWED_API_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return JSON.stringify({ error: `不允许访问路径: ${path}` })
  }

  const url = `http://127.0.0.1:${SERVER_PORT}${path}`
  const hasBody = (method === "POST" || method === "PUT") && body

  const response = await fetch(url, {
    method: method ?? "GET",
    headers: { "Content-Type": "application/json" },
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
  })

  const data = await response.json()
  const trimmed = JSON.stringify(data, null, 2)

  if (trimmed.length > 8000) {
    return JSON.stringify({
      ...data,
      _truncated: true,
      _note: "响应已截断，仅保留前8000字符",
    }).slice(0, 8000)
  }

  return trimmed
}

export async function* streamChat(
  userMessage: string,
  symbol: string,
  horizon: string,
  conversationHistory: { role: string; content: string }[] = [],
  attachmentIds: string[] = [],
  pageContext?: PageContext,
): AsyncGenerator<string> {
  const messages = await buildChatMessages(
    userMessage,
    symbol,
    horizon,
    conversationHistory,
    attachmentIds,
    pageContext,
  )

  let currentMessages = [...messages]
  const maxToolRounds = 5
  let toolRound = 0

  while (true) {
    const useTools = toolRound < maxToolRounds

    const response = await fetch(`${ABL_API_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ABL_API_TOKEN}`,
      },
      body: JSON.stringify({
        model: ABL_MODEL_ID,
        messages: currentMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
        ...(useTools ? { tools: TOOLS, tool_choice: "auto" } : {}),
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`AI API 请求失败 (${response.status}): ${text}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("无法读取响应流")

    const decoder = new TextDecoder()
    let buffer = ""
    let hasToolCall = false
    let toolCallId = ""
    let toolCallName = ""
    let toolCallArgs = ""

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
        if (data === "[DONE]") continue

        try {
          const parsed = JSON.parse(data)
          const choice = parsed.choices?.[0]
          if (!choice) continue

          const delta = choice.delta
          if (delta?.content) {
            yield delta.content
          }

          if (delta?.tool_calls) {
            hasToolCall = true
            for (const tc of delta.tool_calls) {
              if (tc.id) toolCallId = tc.id
              if (tc.function?.name) toolCallName = tc.function.name
              if (tc.function?.arguments) toolCallArgs += tc.function.arguments
            }
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    if (!hasToolCall) break

    toolRound++
    let toolResult: string
    try {
      const args = JSON.parse(toolCallArgs || "")

      if (toolCallName === "call_server_api") {
        toolResult = await executeServerApiCall(args)
      } else {
        const queryType = args.query_type ?? toolCallName.replace("query_data_", "")
        const queryParams = args.params ?? args
        const result = await executeDataQuery(queryType, queryParams)
        toolResult = JSON.stringify(result, null, 2)
      }
    } catch (e) {
      toolResult = JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
    }

    currentMessages.push({
      role: "assistant",
      content: null as unknown as string,
      tool_calls: [{
        id: toolCallId,
        type: "function",
        function: { name: toolCallName, arguments: toolCallArgs },
      }],
    } as unknown as ChatMessage)

    currentMessages.push({
      role: "tool",
      content: toolResult,
      tool_call_id: toolCallId,
    } as unknown as ChatMessage)

    toolCallId = ""
    toolCallName = ""
    toolCallArgs = ""
  }
}
