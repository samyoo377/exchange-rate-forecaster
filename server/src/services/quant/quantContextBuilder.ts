import type { QuantBundle, StrategySignal } from "./fxTypes.js"

const REGIME_LABELS: Record<string, string> = {
  trending_up: "上升趋势",
  trending_down: "下降趋势",
  ranging: "震荡",
  volatile: "高波动",
}

const DIRECTION_LABELS: Record<string, string> = {
  bullish: "偏多",
  bearish: "偏空",
  neutral: "中性",
}

export function buildStructuredQuantContext(bundle: QuantBundle): string {
  const dirLabel = bundle.compositeScore > 20 ? "偏多" : bundle.compositeScore < -20 ? "偏空" : "中性"
  const regimeLabel = REGIME_LABELS[bundle.regime] ?? bundle.regime

  const signalLines = bundle.topSignals
    .map((s) => formatSignalLine(s))
    .join("\n")

  const qualityWarning = buildQualityWarning(bundle)
  const latestBar = bundle.latestBar

  return `## 量化引擎分析 (${bundle.datasetVersion})

### 综合评分
- 评分: ${bundle.compositeScore > 0 ? "+" : ""}${bundle.compositeScore.toFixed(1)} / 100 (${dirLabel})
- 市场状态: ${regimeLabel}
- 置信度: ${(bundle.confidence * 100).toFixed(0)}%
- 预测周期: ${bundle.horizon}

### 最新行情
- 日期: ${latestBar.timestamp.toISOString().slice(0, 10)}
- 收盘: ${latestBar.close.toFixed(4)}
- 开盘: ${latestBar.open.toFixed(4)}
- 最高: ${latestBar.high.toFixed(4)}
- 最低: ${latestBar.low.toFixed(4)}
- 数据源: ${latestBar.source}${latestBar.isSynthetic ? " (合成数据)" : ""}

### 主要策略信号 (Top ${bundle.topSignals.length})
${signalLines}

### 数据质量
- 综合质量分: ${(bundle.dataQuality.overallScore * 100).toFixed(0)}%
- 合成数据占比: ${(bundle.dataQuality.syntheticRatio * 100).toFixed(0)}%
${qualityWarning}`
}

function formatSignalLine(signal: StrategySignal): string {
  const dir = DIRECTION_LABELS[signal.direction] ?? signal.direction
  const scoreStr = signal.score > 0 ? `+${signal.score.toFixed(0)}` : signal.score.toFixed(0)
  const rationale = signal.rationale[0] ?? ""
  return `- ${signal.strategyKey} [${dir}]: ${scoreStr} (置信度 ${(signal.confidence * 100).toFixed(0)}%) — ${rationale}`
}

function buildQualityWarning(bundle: QuantBundle): string {
  const warnings: string[] = []

  if (bundle.dataQuality.syntheticRatio > 0.8) {
    warnings.push("⚠️ 当前数据以合成 OHLC 为主，波动率和支撑阻力类策略可信度较低")
  } else if (bundle.dataQuality.syntheticRatio > 0.5) {
    warnings.push("⚠️ 合成数据占比较高，部分策略结论需谨慎参考")
  }

  if (bundle.dataQuality.overallScore < 0.5) {
    warnings.push("⚠️ 数据质量偏低，建议结合其他信息源交叉验证")
  }

  if (bundle.latestBar.basisRiskLevel === "high") {
    warnings.push("⚠️ 当前数据为代理数据 (非直接 CNH 源)，存在基差风险")
  }

  if (warnings.length === 0) return ""
  return `\n### 风险提示\n${warnings.join("\n")}`
}
