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
  const THRESHOLD = 0.45
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
      const titleSim = similarity(item.title, other.title)
      const summarySim = item.summary && other.summary
        ? similarity(item.summary, other.summary)
        : 0
      const score = Math.max(titleSim, summarySim * 0.8)

      if (score >= THRESHOLD) {
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
    { "factor": "因素名称", "direction": "bullish|bearish|neutral", "detail": "简要说明", "heat": 数字(该因素的热度值) }
  ],
  "sentiment": "bullish|bearish|neutral",
  "hotEvents": [
    { "title": "事件标题", "heat": 数字, "sources": ["来源1","来源2"], "impact": "对汇率的影响简述" }
  ]
}

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

  let parsed: {
    headline: string
    summary: string
    keyFactors: { factor: string; direction: string; detail: string; heat?: number }[]
    sentiment: string
    hotEvents?: { title: string; heat: number; sources: string[]; impact: string }[]
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? content)
  } catch {
    parsed = {
      headline: "消息面摘要生成异常",
      summary: content.slice(0, 500),
      keyFactors: [],
      sentiment: "neutral",
    }
  }

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

  console.log(`[NewsDigester] Created digest: ${digest.id} — ${parsed.headline}`)
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
