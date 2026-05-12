import { prisma } from "../../utils/db.js"
import type { IndicatorValues, SignalResult } from "../../types/index.js"

export interface UnifiedBreakdown {
  technical: {
    score: number
    weight: number
    signals: SignalResult
    indicators: IndicatorValues
  }
  quant: {
    score: number
    weight: number
    regime: string
    confidence: number
    topSignals: { name: string; score: number; direction: string }[]
    snapshotAge: number
  }
  news: {
    score: number
    weight: number
    headline: string
    sentiment: string
    topFactors: { factor: string; score: number; direction: string }[]
    digestAge: number
  }
}

export interface DataFreshness {
  marketDataAge: number
  quantAge: number
  newsAge: number
  overallFresh: boolean
}

export interface UnifiedPredictionResult {
  direction: "bullish" | "bearish" | "neutral"
  confidence: number
  compositeScore: number
  breakdown: UnifiedBreakdown
  rationale: string[]
  riskNotes: string[]
  dataFreshness: DataFreshness
}

const WEIGHTS = { quant: 0.50, technical: 0.25, news: 0.25 }
const DIRECTION_THRESHOLD = 15

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function computeContinuousTechnicalScore(ind: IndicatorValues): number {
  const scores: number[] = []

  if (ind.rsi14 != null) scores.push((50 - ind.rsi14) / 50)
  if (ind.stochK != null) scores.push((50 - ind.stochK) / 50)
  if (ind.cci20 != null) scores.push(clamp(-ind.cci20 / 200, -1, 1))
  if (ind.ao != null) scores.push(clamp(ind.ao / 0.05, -1, 1))
  if (ind.mom10 != null) scores.push(clamp(ind.mom10 / 0.03, -1, 1))

  if (ind.close != null && ind.pivotPP != null) {
    const diffBps = ((ind.close - ind.pivotPP) / ind.pivotPP) * 10000
    scores.push(clamp(-diffBps / 200, -1, 1))
  }

  if (scores.length === 0) return 0
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

export async function fetchLatestQuantScore(symbol: string) {
  const snapshot = await prisma.quantSignalSnapshot.findFirst({
    where: { symbol },
    orderBy: { createdAt: "desc" },
  })
  if (!snapshot) return null

  const signals = JSON.parse(snapshot.signals) as { name: string; score: number; confidence: number; description: string }[]
  const ageMs = Date.now() - snapshot.createdAt.getTime()

  return {
    id: snapshot.id,
    compositeScore: snapshot.compositeScore,
    regime: snapshot.regime,
    confidence: snapshot.confidence,
    signals,
    ageMinutes: Math.round(ageMs / 60_000),
  }
}

export async function fetchLatestNewsScore(symbol: string) {
  const digest = await prisma.newsDigest.findFirst({
    where: { symbol },
    orderBy: { createdAt: "desc" },
  })
  if (!digest) return null

  const keyFactors = JSON.parse(digest.keyFactors) as { factor: string; direction: string; score?: number; confidence?: number; detail: string }[]
  const scored = keyFactors.filter((f) => f.score != null && f.confidence != null)
  const ageMs = Date.now() - digest.createdAt.getTime()

  let avgScore = 0
  if (scored.length > 0) {
    const totalWeight = scored.reduce((s, f) => s + (f.confidence ?? 0.5), 0)
    avgScore = totalWeight > 0
      ? scored.reduce((s, f) => s + (f.score ?? 0) * (f.confidence ?? 0.5), 0) / totalWeight
      : 0
  }

  return {
    score: avgScore,
    headline: digest.headline,
    sentiment: digest.sentiment,
    topFactors: keyFactors.slice(0, 3).map((f) => ({
      factor: f.factor,
      score: f.score ?? 0,
      direction: f.direction,
    })),
    ageMinutes: Math.round(ageMs / 60_000),
  }
}

function newsDecayFactor(ageMinutes: number): number {
  if (ageMinutes <= 120) return 1.0
  if (ageMinutes <= 360) return 0.8
  if (ageMinutes <= 720) return 0.5
  return 0.3
}

export async function computeUnifiedPrediction(
  symbol: string,
  ind: IndicatorValues,
  signals: SignalResult,
): Promise<UnifiedPredictionResult> {
  const [quantData, newsData] = await Promise.all([
    fetchLatestQuantScore(symbol),
    fetchLatestNewsScore(symbol),
  ])

  const technicalScore = computeContinuousTechnicalScore(ind) * 100

  let quantScore = 0
  let quantWeight = WEIGHTS.quant
  let newsScore = 0
  let newsWeight = WEIGHTS.news
  let technicalWeight = WEIGHTS.technical

  if (quantData) {
    quantScore = quantData.compositeScore
  } else {
    quantWeight = 0
    technicalWeight += WEIGHTS.quant * 0.6
    newsWeight += WEIGHTS.quant * 0.4
  }

  if (newsData) {
    const decay = newsDecayFactor(newsData.ageMinutes)
    newsScore = newsData.score * 100 * decay
  } else {
    newsWeight = 0
    technicalWeight += (WEIGHTS.news * 0.5)
    quantWeight += (WEIGHTS.news * 0.5)
  }

  const totalWeight = technicalWeight + quantWeight + newsWeight
  const compositeScore = totalWeight > 0
    ? (technicalScore * technicalWeight + quantScore * quantWeight + newsScore * newsWeight) / totalWeight
    : 0

  const direction: "bullish" | "bearish" | "neutral" =
    compositeScore > DIRECTION_THRESHOLD ? "bullish"
      : compositeScore < -DIRECTION_THRESHOLD ? "bearish"
        : "neutral"

  const absScore = Math.abs(compositeScore)
  const confidence = clamp(absScore / 60, 0, 1)

  const rationale = buildUnifiedRationale(technicalScore, quantData, newsData, direction)
  const riskNotes = [
    "综合预测基于技术指标、量化策略和消息面三源融合，存在模型局限性",
    "突发政策或宏观事件可能导致预测短时失效",
    "本预测仅作为策略辅助参考，不构成交易建议",
  ]

  const quantAge = quantData?.ageMinutes ?? -1
  const newsAge = newsData?.ageMinutes ?? -1
  const overallFresh = (quantAge >= 0 && quantAge < 360) && (newsAge >= 0 && newsAge < 720)

  return {
    direction,
    confidence: parseFloat(confidence.toFixed(4)),
    compositeScore: parseFloat(compositeScore.toFixed(2)),
    breakdown: {
      technical: {
        score: parseFloat(technicalScore.toFixed(2)),
        weight: technicalWeight,
        signals,
        indicators: ind,
      },
      quant: {
        score: quantScore,
        weight: quantWeight,
        regime: quantData?.regime ?? "unknown",
        confidence: quantData?.confidence ?? 0,
        topSignals: quantData?.signals.slice(0, 3).map((s) => ({
          name: s.name,
          score: s.score,
          direction: s.score > 15 ? "bullish" : s.score < -15 ? "bearish" : "neutral",
        })) ?? [],
        snapshotAge: quantAge,
      },
      news: {
        score: parseFloat(newsScore.toFixed(2)),
        weight: newsWeight,
        headline: newsData?.headline ?? "",
        sentiment: newsData?.sentiment ?? "neutral",
        topFactors: newsData?.topFactors ?? [],
        digestAge: newsAge,
      },
    },
    rationale,
    riskNotes,
    dataFreshness: {
      marketDataAge: 0,
      quantAge,
      newsAge,
      overallFresh,
    },
  }
}

function buildUnifiedRationale(
  technicalScore: number,
  quantData: Awaited<ReturnType<typeof fetchLatestQuantScore>>,
  newsData: Awaited<ReturnType<typeof fetchLatestNewsScore>>,
  direction: string,
): string[] {
  const rationale: string[] = []

  if (quantData) {
    const qDir = quantData.compositeScore > 15 ? "偏多" : quantData.compositeScore < -15 ? "偏空" : "中性"
    rationale.push(`量化7策略复合评分${qDir}(${quantData.compositeScore > 0 ? "+" : ""}${quantData.compositeScore.toFixed(0)})，市场状态: ${quantData.regime}`)
  }

  if (newsData && newsData.headline) {
    const nDir = newsData.sentiment === "bullish" ? "利多美元" : newsData.sentiment === "bearish" ? "利空美元" : "中性"
    rationale.push(`消息面${nDir}：${newsData.headline}`)
  }

  const tDir = technicalScore > 10 ? "偏多" : technicalScore < -10 ? "偏空" : "中性"
  rationale.push(`技术面指标${tDir}(${technicalScore > 0 ? "+" : ""}${technicalScore.toFixed(0)})`)

  if (rationale.length === 0) {
    rationale.push("当前各维度信号均处于中性区间")
  }

  return rationale
}
