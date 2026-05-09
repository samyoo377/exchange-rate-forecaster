import axios from "axios"
import type { QuantBar } from "../types.js"

const ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR"

export async function fetchFromEcb(symbol: string, days = 120): Promise<QuantBar[]> {
  const { freq, currency, baseCurrency } = mapSymbol(symbol)

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

  const series = Object.values(dataset.series)?.[0] as any
  if (!series?.observations) {
    throw new Error("ECB returned no observations")
  }

  const timeValues: string[] = structure.values.map((v: any) => v.id)
  const observations = series.observations as Record<string, number[]>

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const bars: QuantBar[] = []

  for (const [idx, values] of Object.entries(observations)) {
    const dateStr = timeValues[Number(idx)]
    if (!dateStr || !values?.[0]) continue

    const date = new Date(dateStr)
    if (date < cutoffDate) continue

    const rate = convertToUsdBase(values[0], baseCurrency, symbol)
    bars.push({
      date,
      open: rate,
      high: rate * 1.001,
      low: rate * 0.999,
      close: rate,
      source: "ecb",
      synthetic: true,
    })
  }

  if (bars.length === 0) {
    throw new Error(`ECB returned no data for ${symbol} in the last ${days} days`)
  }

  return bars.sort((a, b) => a.date.getTime() - b.date.getTime())
}

function mapSymbol(symbol: string): { freq: string; currency: string; baseCurrency: string } {
  if (symbol === "USDCNH" || symbol === "USDCNY") {
    return { freq: "D", currency: "CNY", baseCurrency: "EUR" }
  }
  return { freq: "D", currency: symbol.slice(3), baseCurrency: "EUR" }
}

function convertToUsdBase(eurRate: number, baseCurrency: string, symbol: string): number {
  if (symbol === "USDCNH" || symbol === "USDCNY") {
    // ECB gives EUR/CNY, we need USD/CNY
    // Approximate: USD/CNY ≈ EUR/CNY / EUR/USD
    // We'll use a rough EUR/USD of 1.08 as fallback
    // In production this should be fetched dynamically
    return eurRate / 1.08
  }
  return eurRate
}
