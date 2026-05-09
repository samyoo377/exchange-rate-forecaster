import axios from "axios"
import type { QuantBar } from "../types.js"

const BASE_URL = "https://api.frankfurter.dev/v1"

interface FrankfurterResponse {
  base: string
  start_date: string
  end_date: string
  rates: Record<string, Record<string, number>>
}

export async function fetchFromFrankfurter(symbol: string, days = 120): Promise<QuantBar[]> {
  const { base, target } = mapSymbol(symbol)
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const startStr = formatDate(startDate)
  const endStr = formatDate(endDate)

  const response = await axios.get<FrankfurterResponse>(
    `${BASE_URL}/${startStr}..${endStr}`,
    {
      params: { base, symbols: target },
      timeout: 10000,
    },
  )

  const rates = response.data.rates
  if (!rates || Object.keys(rates).length === 0) {
    throw new Error(`Frankfurter returned no data for ${base}/${target}`)
  }

  return Object.entries(rates)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateStr, rateMap]) => {
      const close = rateMap[target]
      return {
        date: new Date(dateStr),
        open: close,
        high: close * 1.001,
        low: close * 0.999,
        close,
        source: "frankfurter",
        synthetic: true,
      }
    })
}

function mapSymbol(symbol: string): { base: string; target: string } {
  if (symbol === "USDCNH" || symbol === "USDCNY") return { base: "USD", target: "CNY" }
  return { base: symbol.slice(0, 3), target: symbol.slice(3) }
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
