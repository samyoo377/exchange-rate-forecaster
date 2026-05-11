import { z } from "zod"
import { prisma } from "../../utils/db.js"

const ABL_API_BASE_URL = process.env.ABL_API_BASE_URL ?? "https://api.ablai.top"
const ABL_API_TOKEN = process.env.ABL_API_TOKEN ?? ""
const DIGEST_MODEL_ID = "gpt-5.4-2026-03-05"

interface RawItem {
  id: string
  source: string
  title: string
  summary: string | null
  publishedAt: Date | null
  fetchedAt: Date
  url: string
  category: string | null
}

interface NewsCluster {
  representative: RawItem
  items: RawItem[]
  heat: number
  sources: string[]
}

// ── Zod Schema：AI 输出结构化校验 ──

const KeyFactorSchema = z.object({
  factor: z.string().min(1).max(50),
  direction: z.enum(["bullish", "bearish", "neutral"]),
  score: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  detail: z.string().min(1).max(300),
  heat: z.number().optional(),
})

const HotEventSchema = z.object({
  title: z.string().min(1).max(100),
  heat: z.number(),
  sources: z.array(z.string()),
  impact: z.string().min(1).max(200),
})

const DigestOutputSchema = z.object({
  headline: z.string().min(5).max(100),
  summary: z.string().min(50).max(800),
  keyFactors: z.array(KeyFactorSchema).min(1).max(10),
  sentiment: z.enum(["bullish", "bearish", "neutral"]),
  hotEvents: z.array(HotEventSchema).optional(),
})

type DigestOutput = z.infer<typeof DigestOutputSchema>

function validateConsistency(digest: DigestOutput): string[] {
  const issues: string[] = []
  const avgScore = digest.keyFactors.reduce((s, f) => s + f.score, 0) / digest.keyFactors.length

  if (digest.sentiment === "bullish" && avgScore < -0.3) {
    issues.push(`sentiment=bullish 但 avgScore=${avgScore.toFixed(2)} 偏空`)
  }
  if (digest.sentiment === "bearish" && avgScore > 0.3) {
    issues.push(`sentiment=bearish 但 avgScore=${avgScore.toFixed(2)} 偏多`)
  }

  const lowConfidence = digest.keyFactors.filter((f) => f.confidence < 0.3)
  if (lowConfidence.length > digest.keyFactors.length * 0.6) {
    issues.push("超过60%的因素置信度低于0.3")
  }

  return issues
}

function normalizeText(text: string): string {
  return text
    .replace(/[\s　]+/g, "")
    .replace(/[（(【\[{「『][^）)】\]}」』]*[）)】\]}」』]/g, "")
    .replace(/[^一-鿿\w]/g, "")
    .toLowerCase()
}

function similarity(a: string, b: string): number {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (na === nb) return 1

  const shorter = na.length < nb.length ? na : nb
  const longer = na.length < nb.length ? nb : na

  if (shorter.length === 0) return 0
  if (longer.includes(shorter)) return shorter.length / longer.length

  const bigramsA = new Set<string>()
  for (let i = 0; i < na.length - 1; i++) bigramsA.add(na.slice(i, i + 2))
  const bigramsB = new Set<string>()
  for (let i = 0; i < nb.length - 1; i++) bigramsB.add(nb.slice(i, i + 2))

  let intersection = 0
  for (const bg of bigramsA) if (bigramsB.has(bg)) intersection++
  const union = bigramsA.size + bigramsB.size - intersection
  return union === 0 ? 0 : intersection / union
}

function clusterNews(items: RawItem[]): NewsCluster[] {
  const BASE_THRESHOLD = 0.45
  const clusters: NewsCluster[] = []
  const assigned = new Set<string>()

  for (const item of items) {
    if (assigned.has(item.id)) continue

    const cluster: NewsCluster = {
      representative: item,
      items: [item],
      heat: 1,
      sources: [item.source],
    }
    assigned.add(item.id)

    for (const other of items) {
      if (assigned.has(other.id)) continue

      const threshold = adaptiveThreshold(cluster.items.length, items.length)
      const titleSim = similarity(item.title, other.title)
      const summarySim = item.summary && other.summary
        ? similarity(item.summary, other.summary)
        : 0
      const score = Math.max(titleSim, summarySim * 0.8)

      if (score >= threshold) {
        cluster.items.push(other)
        if (!cluster.sources.includes(other.source)) {
          cluster.sources.push(other.source)
        }
        assigned.add(other.id)
      }
    }

    cluster.heat = cluster.sources.length * 2 + cluster.items.length - 1
    if (cluster.items.length > 1) {
      const longest = cluster.items.reduce((a, b) =>
        (a.title.length + (a.summary?.length ?? 0)) > (b.title.length + (b.summary?.length ?? 0)) ? a : b
      )
      cluster.representative = longest
    }

    clusters.push(cluster)
  }

  clusters.sort((a, b) => b.heat - a.heat)
  return clusters
}

function adaptiveThreshold(clusterSize: number, totalItems: number): number {
  const ratio = clusterSize / totalItems
  if (ratio > 0.25) return 0.55
  if (ratio > 0.12) return 0.50
  return 0.45
}

const DIGEST_SYSTEM_PROMPT = `你是一位专业的外汇与宏观经济新闻分析师，专注于 USD/CNH（美元兑离岸人民币）汇率相关的消息面分析。

你的任务是消化一批近期新闻快讯，输出结构化的消息面摘要，供汇率分析师参考。

输入说明：
- 新闻已按「热度」降序排列——被多个信源重复报道的事件排在前面
- 每条新闻前会标注 [热度:N] 和 [来源:X,Y,Z]，N 越大说明该事件影响越广
- 你应当重点关注高热度事件

输出要求（严格按以下 JSON 格式，不要输出其他内容）：
{
  "headline": "一句话概括当前消息面核心主题（不超过50字）",
  "summary": "消息面综合分析摘要（200-400字），涵盖关键事件、政策动向、市场情绪，聚焦对 USD/CNH 汇率的潜在影响",
  "keyFactors": [
    {
      "factor": "因素名称",
      "direction": "bullish|bearish|neutral",
      "score": 数字(-1.0到+1.0，表示对美元的影响强度，+1=强烈利多美元，-1=强烈利空美元),
      "confidence": 数字(0到1.0，表示你对该判断的确信程度),
      "detail": "简要说明",
      "heat": 数字(该因素的热度值)
    }
  ],
  "sentiment": "bullish|bearish|neutral",
  "hotEvents": [
    { "title": "事件标题", "heat": 数字, "sources": ["来源1","来源2"], "impact": "对汇率的影响简述" }
  ]
}

评分指南：
- score 范围：-1.0（强烈利空美元）到 +1.0（强烈利多美元），0 为中性
  - ±0.8~1.0：重大政策转向、突发地缘事件
  - ±0.5~0.7：明确的经济数据超预期、官员鹰派/鸽派表态
  - ±0.2~0.4：温和的市场信号、预期内的政策延续
  - 0~±0.2：影响不明确或已被市场消化
- confidence 范围：0~1.0
  - 0.8~1.0：事实明确、因果关系清晰
  - 0.5~0.7：逻辑合理但存在不确定性
  - 0.3~0.5：推测性判断
  - <0.3：高度不确定

分析要点：
- 重点关注：美联储/中国央行政策、贸易摩擦、关税政策、中美关系、地缘政治、经济数据（CPI/PMI/GDP/非农）
- bullish 表示利好美元（USD/CNH 上行压力），bearish 表示利空美元（USD/CNH 下行压力）
- sentiment 是对整体消息面的综合判断
- hotEvents 列出热度最高的 3-5 个事件
- 如果新闻中无明确与外汇相关的内容，仍然给出中性判断并简述当前消息面状态
- 保持客观专业，不夸大影响`

export async function digestRecentNews(symbol = "USDCNH"): Promise<{ digestId: string; headline: string } | null> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const recentNews = await prisma.newsRawItem.findMany({
    where: { fetchedAt: { gte: cutoff } },
    orderBy: { fetchedAt: "desc" },
    take: 120,
  })

  if (recentNews.length === 0) {
    console.log("[NewsDigester] No recent news to digest")
    return null
  }

  const clusters = clusterNews(recentNews as RawItem[])

  console.log(`[NewsDigester] ${recentNews.length} items → ${clusters.length} clusters (top heat: ${clusters[0]?.heat ?? 0})`)

  const newsText = clusters
    .slice(0, 60)
    .map((c, i) => {
      const r = c.representative
      const heatTag = `[热度:${c.heat}]`
      const sourceTag = `[来源:${c.sources.join(",")}]`
      const dupeNote = c.items.length > 1 ? ` (${c.items.length}条相似报道)` : ""
      return `${i + 1}. ${heatTag} ${sourceTag}${dupeNote} ${r.title}${r.summary ? "\n   " + r.summary.slice(0, 200) : ""}`
    })
    .join("\n")

  const allItemIds = clusters.flatMap((c) => c.items.map((it) => it.id))

  const messages = [
    { role: "system", content: DIGEST_SYSTEM_PROMPT },
    {
      role: "user",
      content: `以下是最近获取的 ${recentNews.length} 条新闻快讯（去重聚合为 ${clusters.length} 个事件），请消化总结：\n\n${newsText}`,
    },
  ]

  const response = await fetch(`${ABL_API_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ABL_API_TOKEN}`,
    },
    body: JSON.stringify({
      model: DIGEST_MODEL_ID,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Digest API failed (${response.status}): ${text}`)
  }

  const result = await response.json() as any
  const content = result.choices?.[0]?.message?.content ?? ""

  let parsed: DigestOutput
  let validationIssues: string[] = []

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const raw = JSON.parse(jsonMatch?.[0] ?? content)
    const validated = DigestOutputSchema.safeParse(raw)

    if (validated.success) {
      parsed = validated.data
      validationIssues = validateConsistency(parsed)
      if (validationIssues.length > 0) {
        console.warn(`[NewsDigester] 逻辑一致性警告: ${validationIssues.join("; ")}`)
      }
    } else {
      console.warn(`[NewsDigester] Schema 校验失败，尝试兼容处理:`, validated.error.issues.slice(0, 3))
      parsed = {
        headline: raw.headline ?? "消息面摘要",
        summary: raw.summary ?? content.slice(0, 500),
        keyFactors: (raw.keyFactors ?? []).map((f: any) => ({
          factor: f.factor ?? "未知因素",
          direction: ["bullish", "bearish", "neutral"].includes(f.direction) ? f.direction : "neutral",
          score: typeof f.score === "number" ? Math.max(-1, Math.min(1, f.score)) : 0,
          confidence: typeof f.confidence === "number" ? Math.max(0, Math.min(1, f.confidence)) : 0.5,
          detail: f.detail ?? "",
          heat: f.heat,
        })),
        sentiment: ["bullish", "bearish", "neutral"].includes(raw.sentiment) ? raw.sentiment : "neutral",
        hotEvents: raw.hotEvents,
      }
      validationIssues.push("schema_fallback")
    }
  } catch {
    parsed = {
      headline: "消息面摘要生成异常",
      summary: content.slice(0, 500),
      keyFactors: [{ factor: "解析失败", direction: "neutral", score: 0, confidence: 0, detail: "AI输出格式异常" }],
      sentiment: "neutral",
    }
    validationIssues.push("json_parse_error")
  }

  const avgScore = parsed.keyFactors.length > 0
    ? parsed.keyFactors.reduce((s, f) => s + f.score * f.confidence, 0) / parsed.keyFactors.length
    : 0

  const digest = await prisma.newsDigest.create({
    data: {
      symbol,
      headline: parsed.headline,
      summary: parsed.summary,
      keyFactors: JSON.stringify(parsed.keyFactors),
      sentiment: parsed.sentiment,
      rawItemIds: JSON.stringify(allItemIds),
      modelVersion: DIGEST_MODEL_ID,
    },
  })

  console.log(`[NewsDigester] Created digest: ${digest.id} — ${parsed.headline} (avgScore: ${avgScore.toFixed(3)}, issues: ${validationIssues.length})`)
  return { digestId: digest.id, headline: parsed.headline }
}

export async function getLatestDigest(symbol = "USDCNH") {
  const digest = await prisma.newsDigest.findFirst({
    where: { symbol },
    orderBy: { createdAt: "desc" },
  })
  if (!digest) return null

  const rawItemIds: string[] = JSON.parse(digest.rawItemIds)
  const rawItems = rawItemIds.length > 0
    ? await prisma.newsRawItem.findMany({
        where: { id: { in: rawItemIds.slice(0, 50) } },
        orderBy: { fetchedAt: "desc" },
      })
    : []

  return {
    ...digest,
    keyFactors: JSON.parse(digest.keyFactors),
    rawItems: rawItems.map((r) => ({
      id: r.id,
      source: r.source,
      title: r.title,
      url: r.url,
      summary: r.summary,
      publishedAt: r.publishedAt,
      category: r.category,
    })),
  }
}

export async function getRecentDigests(symbol = "USDCNH", limit = 5) {
  const digests = await prisma.newsDigest.findMany({
    where: { symbol },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return digests.map((d) => ({
    ...d,
    keyFactors: JSON.parse(d.keyFactors),
  }))
}
