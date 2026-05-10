import { prisma } from "../../utils/db.js"
import { getFileAsBase64, isImageMime, extractTextFromFile } from "../file/fileService.js"
import { buildApiToolDescription } from "./apiRegistry.js"
import { executeDataQuery, AVAILABLE_QUERIES } from "./dataQuery.js"
import type { PageContext } from "./chatService.js"

const ABL_API_BASE_URL = process.env.ABL_API_BASE_URL ?? "https://api.ablai.top"
const ABL_API_TOKEN = process.env.ABL_API_TOKEN ?? ""
const ADMIN_MODEL_ID = process.env.ADMIN_MODEL_ID ?? "claude-sonnet-4-6"

const MODEL_META: Record<string, { name: string; desc: string; speed: string; capability: string }> = {
  "claude-sonnet-4-6": { name: "Claude Sonnet 4.6", desc: "Anthropic 均衡模型，速度与质量兼顾", speed: "快", capability: "综合分析、代码、写作" },
  "claude-opus-4-6": { name: "Claude Opus 4.6", desc: "Anthropic 旗舰模型，最强推理和创作能力", speed: "较慢", capability: "深度推理、复杂分析、高质量写作" },
  "gpt-5.4-2026-03-05": { name: "GPT-5.4", desc: "OpenAI 最新一代旗舰模型，综合能力强", speed: "快", capability: "综合分析、多模态、代码、推理" },
  "gemini-3.1-pro-preview-thinking-high": { name: "Gemini 3.1 Pro", desc: "Google 深度思考模型，高级推理模式", speed: "较慢", capability: "深度推理、长文分析、复杂问题拆解" },
  "deepseek-chat": { name: "DeepSeek Chat", desc: "深度求索对话模型，中文优化", speed: "快", capability: "中文对话、代码、数据分析" },
  "deepseek-reasoner": { name: "DeepSeek Reasoner", desc: "深度求索推理模型，深度思考", speed: "较慢", capability: "数学推理、逻辑推演、复杂问题" },
}

function parseModelList(): string[] {
  const envList = process.env.ADMIN_MODEL_LIST
  if (envList) {
    return envList.split(",").map((s) => s.trim()).filter(Boolean)
  }
  return [ADMIN_MODEL_ID]
}

export function getAdminModels() {
  const ids = parseModelList()
  return ids.map((id) => {
    const meta = MODEL_META[id]
    return {
      id,
      name: meta?.name ?? id,
      description: meta?.desc ?? "",
      speed: meta?.speed ?? "",
      capability: meta?.capability ?? "",
    }
  })
}

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | ContentPart[]
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

async function getTableStats() {
  const tables = [
    "RawMarketData",
    "NormalizedMarketSnapshot",
    "InsightSummary",
    "PredictionResult",
    "TaskRunLog",
    "NewsRawItem",
    "NewsDigest",
  ] as const

  const stats: Record<string, number> = {}
  for (const t of tables) {
    try {
      stats[t] = await (prisma[t.charAt(0).toLowerCase() + t.slice(1) as keyof typeof prisma] as any).count()
    } catch {
      stats[t] = -1
    }
  }
  return stats
}

async function getSampleData(tableName: string, limit = 5) {
  const model = tableName.charAt(0).toLowerCase() + tableName.slice(1)
  try {
    return await (prisma as any)[model].findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
    })
  } catch {
    return []
  }
}

const ADMIN_SYSTEM_PROMPT = `你是汇率预测系统的管理后台 AI 助手，负责帮助管理员快速查询数据、理解系统状态、排查问题。

重要安全规则：你只有只读查询权限，不能执行任何增删改操作。系统仅允许 findMany 和 count 两种操作。

你可以使用的数据库表：
1. **RawMarketData** — 原始市场数据（source, symbol, payload, fetchedAt, status）
2. **NormalizedMarketSnapshot** — 标准化OHLC快照（symbol, snapshotDate, open, high, low, close, volume, source, version）
3. **InsightSummary** — 洞察摘要（symbol, summaryTitle, summaryText, drivers, tags）
4. **PredictionResult** — 预测结果（symbol, userQuery, horizon, direction, confidence, rationale, riskNotes, modelVersion）
5. **TaskRunLog** — 任务执行日志（taskType, status, inputRef, outputRef, startedAt, finishedAt, errorMessage）
6. **NewsRawItem** — 新闻原始数据（source, title, url, summary, publishedAt, fetchedAt, category）
7. **NewsDigest** — 新闻消化摘要（symbol, headline, summary, keyFactors, sentiment, modelVersion）

当用户请求查询数据时，你需要输出一个 JSON 指令块来执行查询。格式如下：
\`\`\`query
{
  "action": "findMany 或 count",
  "table": "表名(PascalCase)",
  "where": { "字段名": "值" 或 { "contains": "模糊值" } 或 { "gte": "日期" } },
  "orderBy": { "字段名": "asc" 或 "desc" },
  "take": 数字(最大100),
  "skip": 数字
}
\`\`\`

查询指令会被系统自动执行并将结果返回给你，然后你再用自然语言解读结果。

你也可以直接回答关于系统架构、数据含义、操作指导等问题，不一定每次都需要查询数据库。

回答要求：
- 使用中文回答
- 简洁明了
- 如果涉及数据，先查询再回答，不要猜测
- 如果用户要求修改、删除或插入数据，明确告知无此权限，建议通过管理界面操作`

export async function buildAdminContext(): Promise<string> {
  const stats = await getTableStats()
  const lines = Object.entries(stats)
    .map(([table, count]) => `${table}: ${count} 条`)
    .join("\n")
  return `当前数据库统计:\n${lines}`
}

const SERVER_PORT = process.env.PORT ?? "4001"
const ALLOWED_API_PREFIXES = ["/api/v1/"]

const ADMIN_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_data",
      description: "查询数据库中的市场数据、预测历史、指标值、新闻摘要、量化信号或统计信息。",
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
            description: "API 路径，如 /api/v1/admin/tables",
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

async function executeAdminServerApiCall(args: { method: string; path: string; body?: unknown }): Promise<string> {
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

export async function* streamAdminChat(
  userMessage: string,
  conversationHistory: ChatMessage[] = [],
  modelOverride?: string,
  attachmentIds: string[] = [],
  pageContext?: PageContext,
): AsyncGenerator<string> {
  const context = await buildAdminContext()
  const modelId = modelOverride || ADMIN_MODEL_ID

  const userContent = await buildAdminUserContent(userMessage, attachmentIds)

  const pageCtxStr = pageContext
    ? `\n\n## 当前用户页面上下文\n页面: ${pageContext.pageName}${pageContext.pageData ? `\n页面数据:\n${pageContext.pageData}` : ""}`
    : ""

  const messages: ChatMessage[] = [
    { role: "system", content: `${ADMIN_SYSTEM_PROMPT}\n\n${context}${pageCtxStr}` },
    ...conversationHistory,
    { role: "user", content: userContent },
  ]

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
        model: modelId,
        messages: currentMessages,
        stream: true,
        temperature: 0.3,
        max_tokens: 4096,
        ...(useTools ? { tools: ADMIN_TOOLS, tool_choice: "auto" } : {}),
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Admin AI API failed (${response.status}): ${text}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error("无法读取响应流")

    const decoder = new TextDecoder()
    let buffer = ""
    let fullResponse = ""
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
            fullResponse += delta.content
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

    if (!hasToolCall) {
      // fallback: check for legacy ```query block in response
      const queryMatch = fullResponse.match(/```query\s*\n([\s\S]*?)\n```/)
      if (queryMatch) {
        try {
          const queryDef = JSON.parse(queryMatch[1])
          const result = await executeQuery(queryDef)
          const resultStr = JSON.stringify(result, null, 2)
          yield "\n\n---\n**查询结果：**\n```json\n" + resultStr + "\n```\n"
        } catch (e) {
          yield `\n\n查询执行失败: ${(e as Error).message}`
        }
      }
      break
    }

    toolRound++
    let toolResult: string
    try {
      const args = JSON.parse(toolCallArgs || "{}")

      if (toolCallName === "call_server_api") {
        toolResult = await executeAdminServerApiCall(args)
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

const ALLOWED_TABLES = new Set([
  "RawMarketData",
  "NormalizedMarketSnapshot",
  "InsightSummary",
  "PredictionResult",
  "TaskRunLog",
  "NewsRawItem",
  "NewsDigest",
])

const ALLOWED_WHERE_OPS = new Set([
  "equals",
  "not",
  "in",
  "notIn",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "startsWith",
  "endsWith",
])

function sanitizeWhere(where: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {}
  for (const [field, condition] of Object.entries(where)) {
    if (field === "AND" || field === "OR" || field === "NOT") {
      const arr = Array.isArray(condition) ? condition : [condition]
      clean[field] = arr.map((c: Record<string, any>) => sanitizeWhere(c))
      continue
    }
    if (typeof condition !== "object" || condition === null || condition instanceof Date) {
      clean[field] = condition
      continue
    }
    const safeCond: Record<string, any> = {}
    for (const [op, val] of Object.entries(condition)) {
      if (ALLOWED_WHERE_OPS.has(op)) safeCond[op] = val
    }
    if (Object.keys(safeCond).length > 0) clean[field] = safeCond
  }
  return clean
}

interface ReadonlyQueryDef {
  table: string
  action?: "findMany" | "count"
  where?: Record<string, any>
  orderBy?: Record<string, string>
  take?: number
  skip?: number
}

async function executeQuery(queryDef: ReadonlyQueryDef) {
  if (!ALLOWED_TABLES.has(queryDef.table)) {
    throw new Error(`不允许访问的表: ${queryDef.table}`)
  }

  const action = queryDef.action ?? "findMany"
  if (action !== "findMany" && action !== "count") {
    throw new Error(`仅允许查询操作(findMany/count)，不允许: ${action}`)
  }

  const model = queryDef.table.charAt(0).toLowerCase() + queryDef.table.slice(1)
  const prismaModel = (prisma as any)[model]
  if (!prismaModel) throw new Error(`Unknown table: ${queryDef.table}`)

  const safeWhere = queryDef.where ? sanitizeWhere(queryDef.where) : undefined

  if (action === "count") {
    return { count: await prismaModel.count({ where: safeWhere }) }
  }

  return prismaModel.findMany({
    where: safeWhere,
    orderBy: queryDef.orderBy,
    take: Math.min(queryDef.take ?? 20, 100),
    skip: queryDef.skip ?? 0,
  })
}

export async function executeAdminQuery(queryDef: ReadonlyQueryDef) {
  return executeQuery(queryDef)
}

async function buildAdminUserContent(
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
