import axios from "axios"
import type { FxDataSourceAdapter, HistoryRequest, FxBar } from "../fxTypes.js"

const ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR"

export const ecbFxAdapter: FxDataSourceAdapter = {
  name: "ecb",
  priority: 3,

  supports(symbol: string): boolean {
    return symbol === "USDCNH" || symbol === "USDCNY" || symbol === "EURUSD"
  },

  async queryHistory(request: HistoryRequest): Promise<FxBar[]> {
    const { freq, currency, baseCurrency } = mapSymbol(request.symbol)

    const response = await axios.get(
      `${ECB_URL}/${freq}.${currency}.${baseCurrency}.SP00.A`,
      {
        headers: { Accept: "application/vnd.sdmx.data+json;version=1.0.0-wd" },
        timeout: 15000,
      },
    )

    const dataset = response.data?.dataSets?.[0]
    const structure = response.data?.structure?.dimensions?.observation?.[0]

    if (!dataset || !structure) {
      throw new Error("ECB returned unexpected data structure")
    }

    const series = Object.values(dataset.series)?.[0] as { observations?: Record<string, number[]> }
    if (!series?.observations) {
      throw new Error("ECB returned no observations")
    }

    const timeValues: string[] = structure.values.map((v: { id: string }) => v.id)
    const observations = series.observations

    const endDate = request.end ?? new Date()
    const days = request.limit ?? 120
    const cutoffDate = request.start ?? (() => {
      const d = new Date(endDate)
      d.setDate(d.getDate() - days)
      return d
    })()

    const bars: FxBar[] = []

    for (const [idx, values] of Object.entries(observations)) {
      const dateStr = timeValues[Number(idx)]
      if (!dateStr || !values?.[0]) continue

      const date = new Date(dateStr)
      if (date < cutoffDate || date > endDate) continue

      const rate = convertToUsdBase(values[0], request.symbol)
      bars.push({
        symbol: request.symbol,
        interval: request.interval,
        timestamp: date,
        open: rate,
        high: rate * 1.001,
        low: rate * 0.999,
        close: rate,
        source: "ecb",
        isSynthetic: true,
        qualityScore: 0.3,
        version: `ecb_v1_${endDate.toISOString().slice(0, 10)}`,
        canonicalSymbol: request.symbol,
        sourceSymbol: `EUR/${currency}`,
        proxyFor: "EUR交叉换算",
        basisRiskLevel: "high",
      })
    }

    if (bars.length === 0) {
      throw new Error(`ECB returned no data for ${request.symbol} in the requested range`)
    }

    return bars.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  },
}

function mapSymbol(symbol: string): { freq: string; currency: string; baseCurrency: string } {
  if (symbol === "USDCNH" || symbol === "USDCNY") {
    return { freq: "D", currency: "CNY", baseCurrency: "EUR" }
  }
  return { freq: "D", currency: symbol.slice(3), baseCurrency: "EUR" }
}

function convertToUsdBase(eurRate: number, symbol: string): number {
  if (symbol === "USDCNH" || symbol === "USDCNY") {
    return eurRate / 1.08
  }
  return eurRate
}
