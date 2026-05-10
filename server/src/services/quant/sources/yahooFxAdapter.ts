import yahooFinance from "yahoo-finance2"
import type { FxDataSourceAdapter, HistoryRequest, FxBar } from "../fxTypes.js"

interface YahooQuote {
  date: Date
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

const SYMBOL_MAP: Record<string, { yahooSymbol: string; sourceSymbol: string; proxyFor?: string; basisRiskLevel: "low" | "medium" | "high" }> = {
  USDCNH: { yahooSymbol: "CNY=X", sourceSymbol: "CNY=X", proxyFor: "USDCNY→USDCNH", basisRiskLevel: "medium" },
  USDCNY: { yahooSymbol: "CNY=X", sourceSymbol: "CNY=X", basisRiskLevel: "low" },
  EURUSD: { yahooSymbol: "EURUSD=X", sourceSymbol: "EURUSD=X", basisRiskLevel: "low" },
  GBPUSD: { yahooSymbol: "GBPUSD=X", sourceSymbol: "GBPUSD=X", basisRiskLevel: "low" },
  USDJPY: { yahooSymbol: "JPY=X", sourceSymbol: "JPY=X", basisRiskLevel: "low" },
}

export const yahooFxAdapter: FxDataSourceAdapter = {
  name: "yahoo_finance",
  priority: 1,

  supports(symbol: string): boolean {
    return symbol in SYMBOL_MAP
  },

  async queryHistory(request: HistoryRequest): Promise<FxBar[]> {
    const mapping = SYMBOL_MAP[request.symbol]
    if (!mapping) {
      throw new Error(`Yahoo adapter does not support symbol: ${request.symbol}`)
    }

    const endDate = request.end ?? new Date()
    const startDate = request.start ?? (() => {
      const d = new Date(endDate)
      d.setDate(d.getDate() - (request.limit ?? 120))
      return d
    })()

    const result = await yahooFinance.chart(mapping.yahooSymbol, {
      period1: startDate,
      period2: endDate,
      interval: mapInterval(request.interval),
    }) as { quotes: YahooQuote[] }

    if (!result.quotes || result.quotes.length === 0) {
      throw new Error(`Yahoo Finance returned no data for ${mapping.yahooSymbol}`)
    }

    return result.quotes
      .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
      .map((q) => ({
        symbol: request.symbol,
        interval: request.interval,
        timestamp: new Date(q.date),
        open: q.open!,
        high: q.high!,
        low: q.low!,
        close: q.close!,
        volume: q.volume ?? undefined,
        source: "yahoo_finance",
        isSynthetic: false,
        qualityScore: 1.0,
        version: `yahoo_v1_${endDate.toISOString().slice(0, 10)}`,
        canonicalSymbol: request.symbol,
        sourceSymbol: mapping.sourceSymbol,
        proxyFor: mapping.proxyFor,
        basisRiskLevel: mapping.basisRiskLevel,
      }))
  },
}

function mapInterval(interval: string): "1d" | "1h" {
  if (interval === "1h" || interval === "4h") return "1h"
  return "1d"
}
