import type { IndicatorValues, SignalResult, PredictionOutput } from "../../types/index.js"

function signalScore(s: "buy" | "sell" | "neutral"): number {
  return s === "buy" ? 1 : s === "sell" ? -1 : 0
}

function getRsiSignal(ind: IndicatorValues, prevRsi?: number): "buy" | "sell" | "neutral" {
  const v = ind.rsi14
  if (v == null) return "neutral"
  if (v < 30 && prevRsi != null && v > prevRsi) return "buy"
  if (v > 70 && prevRsi != null && v < prevRsi) return "sell"
  return "neutral"
}

function getStochSignal(ind: IndicatorValues): "buy" | "sell" | "neutral" {
  const v = ind.stochK
  if (v == null) return "neutral"
  if (v < 20) return "buy"
  if (v > 80) return "sell"
  return "neutral"
}

function getCciSignal(ind: IndicatorValues): "buy" | "sell" | "neutral" {
  const v = ind.cci20
  if (v == null) return "neutral"
  if (v < -100) return "buy"
  if (v > 100) return "sell"
  return "neutral"
}

function getAoSignal(ind: IndicatorValues, prevAo?: number): "buy" | "sell" | "neutral" {
  const v = ind.ao
  if (v == null) return "neutral"
  if (v > 0 && prevAo != null && v > prevAo) return "buy"
  if (v < 0 && prevAo != null && v < prevAo) return "sell"
  return "neutral"
}

function getMomSignal(ind: IndicatorValues): "buy" | "sell" | "neutral" {
  const v = ind.mom10
  if (v == null) return "neutral"
  if (v > 0) return "buy"
  if (v < 0) return "sell"
  return "neutral"
}

export function computeSignals(
  ind: IndicatorValues,
  prev?: IndicatorValues
): SignalResult {
  return {
    rsi: getRsiSignal(ind, prev?.rsi14),
    stoch: getStochSignal(ind),
    cci: getCciSignal(ind),
    ao: getAoSignal(ind, prev?.ao),
    mom: getMomSignal(ind),
  }
}

export function buildPrediction(
  symbol: string,
  horizon: string,
  userQuery: string,
  ind: IndicatorValues,
  signals: SignalResult,
  sourceRefs: string[],
  snapshotVersion: string
): PredictionOutput {
  let score =
    signalScore(signals.rsi) +
    signalScore(signals.stoch) +
    signalScore(signals.cci) +
    signalScore(signals.ao) +
    signalScore(signals.mom)

  const adx = ind.adx14
  if (adx != null) {
    if (adx > 25) score *= 1.2
    else if (adx <= 20) score *= 0.8
  }

  const direction: "bullish" | "bearish" | "neutral" =
    score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral"

  const confidence = Math.min(1, Math.abs(score) / 5)

  const rationale: string[] = []
  if (signals.rsi === "buy") rationale.push("RSI 从超卖区回升（RSI < 30 且上拐）")
  if (signals.rsi === "sell") rationale.push("RSI 进入超买区（RSI > 70 且下拐）")
  if (signals.stoch === "buy") rationale.push(`Stochastic %K 低于超卖线（%K = ${ind.stochK?.toFixed(2)}）`)
  if (signals.stoch === "sell") rationale.push(`Stochastic %K 进入超买区（%K = ${ind.stochK?.toFixed(2)}）`)
  if (signals.cci === "buy") rationale.push(`CCI 低于 -100（CCI = ${ind.cci20?.toFixed(2)}），偏多信号`)
  if (signals.cci === "sell") rationale.push(`CCI 高于 100（CCI = ${ind.cci20?.toFixed(2)}），偏空信号`)
  if (signals.ao === "buy") rationale.push("AO 动量震荡指标由负转正且上升")
  if (signals.ao === "sell") rationale.push("AO 动量震荡指标持续下降且为负")
  if (signals.mom === "buy") rationale.push(`10 期动量为正（MOM = ${ind.mom10?.toFixed(4)}）`)
  if (signals.mom === "sell") rationale.push(`10 期动量为负（MOM = ${ind.mom10?.toFixed(4)}）`)

  if (adx != null) {
    if (adx > 25) {
      const diDir = (ind.plusDi14 ?? 0) > (ind.minusDi14 ?? 0) ? "多头" : "空头"
      rationale.push(`ADX = ${adx.toFixed(2)}（趋势强劲），${diDir}趋势可信度提升（信号分值 ×1.2）`)
    } else if (adx <= 20) {
      rationale.push(`ADX = ${adx.toFixed(2)}（弱趋势/震荡），技术信号可信度降低（信号分值 ×0.8）`)
    }
  }

  if (rationale.length === 0) rationale.push("当前各指标均处于中性区间，无明显方向性信号")

  const riskNotes = [
    "技术指标仅基于历史价格行为，存在滞后性",
    "突发政策或宏观经济事件可能导致技术信号短时失效",
    "本预测仅作为策略辅助参考，不构成交易建议",
  ]

  return {
    symbol,
    horizon,
    direction,
    confidence: parseFloat(confidence.toFixed(4)),
    rationale,
    riskNotes,
    sourceRefs,
    generatedAt: new Date().toISOString(),
    snapshotVersion,
  }
}
