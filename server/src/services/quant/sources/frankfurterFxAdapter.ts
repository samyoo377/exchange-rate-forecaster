import axios from "axios"
import type { FxDataSourceAdapter, HistoryRequest, FxBar } from "../fxTypes.js"

const BASE_URL = "https://api.frankfurter.dev/v1"

interface FrankfurterResponse {
  base: string
  start_date: string
  end_date: string
  rates: Record<string, Record<string, number>>
}

const SYMBOL_MAP: Record<string, { base: string; target: string; proxyFor?: string }> = {
  USDCNH: { base: "USD", target: "CNY", proxyFor: "USDCNY→USDCNH" },
  USDCNY: { base: "USD", target: "CNY" },
  EURUSD: { base: "EUR", target: "USD" },
  GBPUSD: { base: "GBP", target: "USD" },
  USDJPY: { base: "USD", target: "JPY" },
}

export const frankfurterFxAdapter: FxDataSourceAdapter = {
  name: "frankfurter",
  priority: 2,

  supports(symbol: string): boolean {
    return symbol in SYMBOL_MAP
  },

  async queryHistory(request: HistoryRequest): Promise<FxBar[]> {
    const mapping = SYMBOL_MAP[request.symbol]
    if (!mapping) {
      throw new Error(`Frankfurter adapter does not support symbol: ${request.symbol}`)
    }

    const endDate = request.end ?? new Date()
    const startDate = request.start ?? (() => {
      const d = new Date(endDate)
      d.setDate(d.getDate() - (request.limit ?? 120))
      return d
    })()

    const response = await axios.get<FrankfurterResponse>(
      `${BASE_URL}/${formatDate(startDate)}..${formatDate(endDate)}`,
      {
        params: { base: mapping.base, symbols: mapping.target },
        timeout: 10000,
      },
    )

    const rates = response.data.rates
    if (!rates || Object.keys(rates).length === 0) {
      throw new Error(`Frankfurter returned no data for ${mapping.base}/${mapping.target}`)
    }

    return Object.entries(rates)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, rateMap]) => {
        const close = rateMap[mapping.target]
        return {
          symbol: request.symbol,
          interval: request.interval,
          timestamp: new Date(dateStr),
          open: close,
          high: close * 1.001,
          low: close * 0.999,
          close,
          source: "frankfurter",
          isSynthetic: true,
          qualityScore: 0.5,
          version: `frankfurter_v1_${endDate.toISOString().slice(0, 10)}`,
          canonicalSymbol: request.symbol,
          sourceSymbol: `${mapping.base}/${mapping.target}`,
          proxyFor: mapping.proxyFor,
          basisRiskLevel: "high" as const,
        }
      })
  },
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
