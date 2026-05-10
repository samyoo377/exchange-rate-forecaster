import type { QuantStrategy, StrategyContext, StrategySignal, FxBar, FxInterval } from "../fxTypes.js"
import type { MarketRegime } from "../types.js"
import { maCrossoverStrategy } from "./maCrossoverStrategy.js"
import { macdStrategy } from "./macdStrategy.js"
import { momentumStrategy } from "./momentumStrategy.js"
import { meanReversionStrategy } from "./meanReversionStrategy.js"
import { bollingerBandsStrategy } from "./bollingerBandsStrategy.js"
import { supportResistanceStrategy } from "./supportResistanceStrategy.js"
import { volatilityRegimeStrategy } from "./volatilityRegimeStrategy.js"

const registry: QuantStrategy[] = [
  maCrossoverStrategy,
  macdStrategy,
  momentumStrategy,
  meanReversionStrategy,
  bollingerBandsStrategy,
  supportResistanceStrategy,
  volatilityRegimeStrategy,
]

export function getRegisteredStrategies(): QuantStrategy[] {
  return [...registry]
}

export function getStrategy(key: string): QuantStrategy | undefined {
  return registry.find((s) => s.key === key)
}

export function getApplicableStrategies(
  interval: FxInterval,
  regime: MarketRegime,
  hasSyntheticData: boolean,
): QuantStrategy[] {
  return registry.filter((s) => {
    if (!s.supportedIntervals.includes(interval)) return false
    if (hasSyntheticData && !s.supportsSynthetic) return false
    if (s.supportedRegimes && !s.supportedRegimes.includes(regime)) return true
    return true
  })
}

export function runStrategies(
  strategies: QuantStrategy[],
  context: StrategyContext,
): StrategySignal[] {
  const signals: StrategySignal[] = []

  for (const strategy of strategies) {
    try {
      const signal = strategy.evaluate(context)
      signals.push(signal)
    } catch {
      signals.push({
        strategyKey: strategy.key,
        strategyVersion: strategy.version,
        score: 0,
        confidence: 0,
        direction: "neutral",
        rationale: ["策略执行异常"],
        evidence: {},
        dataQualityImpact: 0,
      })
    }
  }

  return signals
}

export function runAllStrategies(bars: FxBar[], regime: MarketRegime): StrategySignal[] {
  if (bars.length === 0) return []

  const interval = bars[0].interval
  const symbol = bars[0].symbol
  const hasSynthetic = bars.some((b) => b.isSynthetic)

  const applicable = getApplicableStrategies(interval, regime, hasSynthetic)

  const context: StrategyContext = { bars, regime, symbol, interval }
  return runStrategies(applicable, context)
}
