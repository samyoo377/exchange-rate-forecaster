import type { IndicatorValues, SignalResult, PredictionOutput } from "../../types/index.js"
import { getIndicatorConfigs } from "../indicators/configService.js"
import type { SignalThresholds } from "../indicators/configService.js"

type Signal = "buy" | "sell" | "neutral"

function signalScore(s: Signal): number {
  return s === "buy" ? 1 : s === "sell" ? -1 : 0
}

// ── Parameterized signal functions ──

function getRsiSignal(
  ind: IndicatorValues, prevRsi?: number,
  th = { buyBelow: 30, sellAbove: 70 },
): Signal {
  const v = ind.rsi14
  if (v == null) return "neutral"
  if (v < th.buyBelow && prevRsi != null && v > prevRsi) return "buy"
  if (v > th.sellAbove && prevRsi != null && v < prevRsi) return "sell"
  return "neutral"
}

function getStochSignal(
  ind: IndicatorValues,
  th = { buyBelow: 20, sellAbove: 80 },
): Signal {
  const v = ind.stochK
  if (v == null) return "neutral"
  if (v < th.buyBelow) return "buy"
  if (v > th.sellAbove) return "sell"
  return "neutral"
}

function getCciSignal(
  ind: IndicatorValues,
  th = { buyBelow: -100, sellAbove: 100 },
): Signal {
  const v = ind.cci20
  if (v == null) return "neutral"
  if (v < th.buyBelow) return "buy"
  if (v > th.sellAbove) return "sell"
  return "neutral"
}

function getAoSignal(
  ind: IndicatorValues, prevAo?: number,
  th = { zeroCross: true },
): Signal {
  const v = ind.ao
  if (v == null) return "neutral"
  if (th.zeroCross) {
    if (v > 0 && prevAo != null && v > prevAo) return "buy"
    if (v < 0 && prevAo != null && v < prevAo) return "sell"
  }
  return "neutral"
}

function getMomSignal(
  ind: IndicatorValues,
  th = { zeroCross: true },
): Signal {
  const v = ind.mom10
  if (v == null) return "neutral"
  if (th.zeroCross) {
    if (v > 0) return "buy"
    if (v < 0) return "sell"
  }
  return "neutral"
}

// ── Default (backward-compatible) ──

export function computeSignals(ind: IndicatorValues, prev?: IndicatorValues): SignalResult {
  return {
    rsi: getRsiSignal(ind, prev?.rsi14),
    stoch: getStochSignal(ind),
    cci: getCciSignal(ind),
    ao: getAoSignal(ind, prev?.ao),
    mom: getMomSignal(ind),
  }
}

// ── Config-aware signal computation ──

export async function computeSignalsFromConfig(
  ind: IndicatorValues,
  prev?: IndicatorValues,
): Promise<SignalResult> {
  const configs = await getIndicatorConfigs()

  const rsiTh = configs.get("RSI")
    ? (JSON.parse(configs.get("RSI")!.signalThresholds) as SignalThresholds["RSI"])
    : { buyBelow: 30, sellAbove: 70 }
  const stochTh = configs.get("STOCH")
    ? (JSON.parse(configs.get("STOCH")!.signalThresholds) as SignalThresholds["STOCH"])
    : { buyBelow: 20, sellAbove: 80 }
  const cciTh = configs.get("CCI")
    ? (JSON.parse(configs.get("CCI")!.signalThresholds) as SignalThresholds["CCI"])
    : { buyBelow: -100, sellAbove: 100 }
  const adxTh = configs.get("ADX")
    ? (JSON.parse(configs.get("ADX")!.signalThresholds) as SignalThresholds["ADX"])
    : { strongTrendAbove: 25, weakTrendBelow: 20, bullishMultiplier: 1.2, bearishMultiplier: 0.8 }
  const aoTh = configs.get("AO")
    ? (JSON.parse(configs.get("AO")!.signalThresholds) as SignalThresholds["AO"])
    : { zeroCross: true }
  const momTh = configs.get("MOM")
    ? (JSON.parse(configs.get("MOM")!.signalThresholds) as SignalThresholds["MOM"])
    : { zeroCross: true }

  return {
    rsi: getRsiSignal(ind, prev?.rsi14, rsiTh),
    stoch: getStochSignal(ind, stochTh),
    cci: getCciSignal(ind, cciTh),
    ao: getAoSignal(ind, prev?.ao, aoTh),
    mom: getMomSignal(ind, momTh),
  }
}

// ── Config-aware prediction builder ──

export async function buildPredictionFromConfig(
  symbol: string,
  horizon: string,
  userQuery: string,
  ind: IndicatorValues,
  signals: SignalResult,
  sourceRefs: string[],
  snapshotVersion: string,
): Promise<PredictionOutput> {
  const configs = await getIndicatorConfigs()

  const w = (type: string) => configs.get(type)?.weight ?? 1
  const adxTh = configs.get("ADX")
    ? (JSON.parse(configs.get("ADX")!.signalThresholds) as SignalThresholds["ADX"])
    : { strongTrendAbove: 25, weakTrendBelow: 20, bullishMultiplier: 1.2, bearishMultiplier: 0.8 }

  let score =
    signalScore(signals.rsi) * w("RSI") +
    signalScore(signals.stoch) * w("STOCH") +
    signalScore(signals.cci) * w("CCI") +
    signalScore(signals.ao) * w("AO") +
    signalScore(signals.mom) * w("MOM")

  const adx = ind.adx14
  if (adx != null) {
    if (adx > adxTh.strongTrendAbove) score *= adxTh.bullishMultiplier
    else if (adx <= adxTh.weakTrendBelow) score *= adxTh.bearishMultiplier
  }

  const totalWeight = w("RSI") + w("STOCH") + w("CCI") + w("AO") + w("MOM")
  const direction: "bullish" | "bearish" | "neutral" =
    score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral"
  const confidence = Math.min(1, Math.abs(score) / totalWeight)

  const rationale = buildRationale(ind, signals, adx, adxTh)
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

function buildRationale(
  ind: IndicatorValues,
  signals: SignalResult,
  adx: number | undefined,
  adxTh: SignalThresholds["ADX"],
): string[] {
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
    if (adx > adxTh.strongTrendAbove) {
      const diDir = (ind.plusDi14 ?? 0) > (ind.minusDi14 ?? 0) ? "多头" : "空头"
      rationale.push(`ADX = ${adx.toFixed(2)}（趋势强劲），${diDir}趋势可信度提升（信号分值 ×${adxTh.bullishMultiplier}）`)
    } else if (adx <= adxTh.weakTrendBelow) {
      rationale.push(`ADX = ${adx.toFixed(2)}（弱趋势/震荡），技术信号可信度降低（信号分值 ×${adxTh.bearishMultiplier}）`)
    }
  }

  if (rationale.length === 0) rationale.push("当前各指标均处于中性区间，无明显方向性信号")
  return rationale
}

// ── Legacy (hardcoded defaults, backward-compatible) ──

export function buildPrediction(
  symbol: string,
  horizon: string,
  userQuery: string,
  ind: IndicatorValues,
  signals: SignalResult,
  sourceRefs: string[],
  snapshotVersion: string,
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

  const defaultAdxTh = { strongTrendAbove: 25, weakTrendBelow: 20, bullishMultiplier: 1.2, bearishMultiplier: 0.8 }
  const rationale = buildRationale(ind, signals, adx, defaultAdxTh)
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
