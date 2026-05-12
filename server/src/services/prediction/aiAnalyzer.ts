import { z } from "zod"
import type { IndicatorValues, SignalResult } from "../../types/index.js"

const ABL_API_BASE_URL = process.env.ABL_API_BASE_URL ?? "https://api.ablai.top"
const ABL_API_TOKEN = process.env.ABL_API_TOKEN ?? ""
const ANALYZER_MODEL = "gpt-5.4-2026-03-05"

const AnalysisSchema = z.object({
  rationale: z.array(z.string().min(10).max(200)).min(2).max(5),
  riskNotes: z.array(z.string().min(10).max(150)).min(1).max(3),
  keyInsight: z.string().min(20).max(300),
})

export interface AiAnalysisResult extends z.infer<typeof AnalysisSchema> {
  aiAnalysisContent?: string
}

interface AnalyzerInput {
  symbol: string
  horizon: string
  direction: "bullish" | "bearish" | "neutral"
  compositeScore: number
  indicators: IndicatorValues
  signals: SignalResult
  quantScore: number | null
  quantRegime: string | null
  newsHeadline: string | null
  newsSentiment: string | null
  newsFactors: { factor: string; direction: string; score: number }[]
}

function buildAnalyzerPrompt(input: AnalyzerInput): string {
  const dirLabel = input.direction === "bullish" ? "看多" : input.direction === "bearish" ? "看空" : "震荡"

  return `你是一个专业的外汇分析师。基于以下数据，为"${input.symbol} ${input.horizon} ${dirLabel}"这个预测结论提供分析依据。

## 预测结论
- 方向: ${dirLabel}
- 综合评分: ${input.compositeScore > 0 ? "+" : ""}${input.compositeScore.toFixed(1)}

## 技术面指标
- RSI(14): ${input.indicators.rsi14?.toFixed(2) ?? "N/A"}
- Stochastic %K: ${input.indicators.stochK?.toFixed(2) ?? "N/A"}
- CCI(20): ${input.indicators.cci20?.toFixed(2) ?? "N/A"}
- ADX(14): ${input.indicators.adx14?.toFixed(2) ?? "N/A"}
- AO: ${input.indicators.ao?.toFixed(4) ?? "N/A"}
- MOM(10): ${input.indicators.mom10?.toFixed(4) ?? "N/A"}

## 技术信号
- RSI: ${input.signals.rsi} | Stoch: ${input.signals.stoch} | CCI: ${input.signals.cci} | AO: ${input.signals.ao} | MOM: ${input.signals.mom}

## 量化策略
- 7策略复合评分: ${input.quantScore != null ? (input.quantScore > 0 ? "+" : "") + input.quantScore.toFixed(1) : "N/A"}
- 市场状态: ${input.quantRegime ?? "N/A"}

## 消息面
- 最新标题: ${input.newsHeadline ?? "无"}
- 情绪: ${input.newsSentiment ?? "N/A"}
${input.newsFactors.length > 0 ? "- 关键因素:\n" + input.newsFactors.map((f) => `  - ${f.factor} (${f.direction}, ${f.score > 0 ? "+" : ""}${f.score.toFixed(2)})`).join("\n") : ""}

请输出 JSON 格式：
{
  "rationale": ["依据1", "依据2", ...],  // 2-5条，每条说明一个支撑该方向的理由
  "riskNotes": ["风险1", ...],  // 1-3条，可能导致预测失效的风险
  "keyInsight": "一句话核心观点"  // 20-300字
}

要求：
- rationale 要具体引用数据（如"RSI 42处于中性偏低区间"），不要泛泛而谈
- riskNotes 要指出具体的反向风险
- 语言简洁专业，中文输出`
}

export async function generateAiAnalysis(input: AnalyzerInput): Promise<AiAnalysisResult> {
  const prompt = buildAnalyzerPrompt(input)
  const analysisLog: string[] = [
    `# AI 预测分析过程`,
    ``,
    `## 输入数据`,
    `- 货币对: ${input.symbol}`,
    `- 预测周期: ${input.horizon}`,
    `- 预判方向: ${input.direction}`,
    `- 综合评分: ${input.compositeScore.toFixed(2)}`,
    ``,
    `## 技术面指标`,
    `| 指标 | 数值 |`,
    `|------|------|`,
    `| RSI(14) | ${input.indicators.rsi14?.toFixed(2) ?? "N/A"} |`,
    `| Stochastic %K | ${input.indicators.stochK?.toFixed(2) ?? "N/A"} |`,
    `| CCI(20) | ${input.indicators.cci20?.toFixed(2) ?? "N/A"} |`,
    `| ADX(14) | ${input.indicators.adx14?.toFixed(2) ?? "N/A"} |`,
    `| AO | ${input.indicators.ao?.toFixed(4) ?? "N/A"} |`,
    `| MOM(10) | ${input.indicators.mom10?.toFixed(4) ?? "N/A"} |`,
    ``,
    `## 信号判定`,
    `- RSI: ${input.signals.rsi} | Stoch: ${input.signals.stoch} | CCI: ${input.signals.cci} | AO: ${input.signals.ao} | MOM: ${input.signals.mom}`,
    ``,
    `## 量化策略`,
    `- 复合评分: ${input.quantScore != null ? input.quantScore.toFixed(1) : "N/A"}`,
    `- 市场状态: ${input.quantRegime ?? "N/A"}`,
    ``,
    `## 消息面`,
    `- 标题: ${input.newsHeadline ?? "无"}`,
    `- 情绪: ${input.newsSentiment ?? "N/A"}`,
  ]

  if (input.newsFactors.length > 0) {
    analysisLog.push(`- 关键因素:`)
    for (const f of input.newsFactors) {
      analysisLog.push(`  - ${f.factor} (${f.direction}, ${f.score > 0 ? "+" : ""}${f.score.toFixed(2)})`)
    }
  }

  if (!ABL_API_TOKEN) {
    const fallback = {
      rationale: buildFallbackRationale(input),
      riskNotes: ["AI分析服务未配置，当前为规则生成的依据"],
      keyInsight: buildFallbackInsight(input),
    }
    analysisLog.push(``, `## AI 调用`, `- 状态: 跳过（API Token 未配置）`, `- 降级: 使用规则生成`)
    analysisLog.push(``, `## 输出`, `- rationale: ${JSON.stringify(fallback.rationale)}`, `- riskNotes: ${JSON.stringify(fallback.riskNotes)}`, `- keyInsight: ${fallback.keyInsight}`)
    return { ...fallback, aiAnalysisContent: analysisLog.join("\n") }
  }

  analysisLog.push(``, `## AI 调用`, `- 模型: ${ANALYZER_MODEL}`, `- temperature: 0.3`)

  const response = await fetch(`${ABL_API_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ABL_API_TOKEN}`,
    },
    body: JSON.stringify({
      model: ANALYZER_MODEL,
      messages: [
        { role: "system", content: "你是专业外汇分析师，输出严格JSON格式。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    const fallback = {
      rationale: buildFallbackRationale(input),
      riskNotes: ["AI分析调用失败，当前为规则生成的依据"],
      keyInsight: buildFallbackInsight(input),
    }
    analysisLog.push(`- 状态: 失败 (HTTP ${response.status})`, `- 降级: 使用规则生成`)
    analysisLog.push(``, `## 输出`, `- rationale: ${JSON.stringify(fallback.rationale)}`, `- keyInsight: ${fallback.keyInsight}`)
    return { ...fallback, aiAnalysisContent: analysisLog.join("\n") }
  }

  const result = await response.json() as any
  const content = result.choices?.[0]?.message?.content ?? ""

  analysisLog.push(`- 状态: 成功`)
  analysisLog.push(``, `## AI 原始输出`, "```json", content, "```")

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("No JSON found")
    const parsed = JSON.parse(jsonMatch[0])
    const validated = AnalysisSchema.parse(parsed)
    analysisLog.push(``, `## 校验`, `- Zod 校验: 通过`)
    return { ...validated, aiAnalysisContent: analysisLog.join("\n") }
  } catch {
    const fallback = {
      rationale: buildFallbackRationale(input),
      riskNotes: ["AI输出解析失败，当前为规则生成的依据"],
      keyInsight: buildFallbackInsight(input),
    }
    analysisLog.push(``, `## 校验`, `- Zod 校验: 失败，降级为规则生成`)
    return { ...fallback, aiAnalysisContent: analysisLog.join("\n") }
  }
}

function buildFallbackRationale(input: AnalyzerInput): string[] {
  const rationale: string[] = []

  if (input.quantScore != null) {
    const qDir = input.quantScore > 15 ? "偏多" : input.quantScore < -15 ? "偏空" : "中性"
    rationale.push(`量化7策略复合评分${qDir}(${input.quantScore > 0 ? "+" : ""}${input.quantScore.toFixed(0)})，市场状态: ${input.quantRegime ?? "unknown"}`)
  }

  if (input.newsHeadline) {
    const nDir = input.newsSentiment === "bullish" ? "利多美元" : input.newsSentiment === "bearish" ? "利空美元" : "中性"
    rationale.push(`消息面${nDir}：${input.newsHeadline}`)
  }

  if (input.indicators.rsi14 != null) {
    const rsiZone = input.indicators.rsi14 < 30 ? "超卖区" : input.indicators.rsi14 > 70 ? "超买区" : "中性区"
    rationale.push(`RSI(14)=${input.indicators.rsi14.toFixed(1)}处于${rsiZone}`)
  }

  if (rationale.length === 0) {
    rationale.push("当前各维度信号均处于中性区间，方向不明确")
  }

  return rationale
}

function buildFallbackInsight(input: AnalyzerInput): string {
  const dirLabel = input.direction === "bullish" ? "偏多" : input.direction === "bearish" ? "偏空" : "震荡"
  return `综合技术面、量化策略和消息面三维度分析，${input.symbol}短期走势${dirLabel}，综合评分${input.compositeScore > 0 ? "+" : ""}${input.compositeScore.toFixed(0)}。`
}
