import axios from "axios"
import type { QuantBar } from "../types.js"

const ALPHA_BASE = "https://www.alphavantage.co/query"

interface AlphaTimeSeriesItem {
  "1. open": string
  "2. high": string
  "3. low": string
  "4. close": string
  "5. volume"?: string
}

export async function fetchFromAlphaVantage(symbol: string, days = 120): Promise<QuantBar[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY
  if (!apiKey) throw new Error("ALPHA_VANTAGE_API_KEY not set")

  const { fromSymbol, toSymbol } = mapSymbol(symbol)

  const response = await axios.get(ALPHA_BASE, {
    params: {
      function: "FX_DAILY",
      from_symbol: fromSymbol,
      to_symbol: toSymbol,
      outputsize: "compact",
      apikey: apiKey,
    },
    timeout: 15000,
  })

  const raw = response.data as Record<string, unknown>
  const timeSeries = raw["Time Series FX (Daily)"] as Record<string, AlphaTimeSeriesItem> | undefined

  if (!timeSeries) {
    const info = (raw["Information"] ?? raw["Note"] ?? raw["Error Message"]) as string | undefined
    throw new Error(info ?? "Alpha Vantage returned unexpected format")
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  return Object.entries(timeSeries)
    .map(([dateStr, item]) => ({
      date: new Date(dateStr),
      open: parseFloat(item["1. open"]),
      high: parseFloat(item["2. high"]),
      low: parseFloat(item["3. low"]),
      close: parseFloat(item["4. close"]),
      volume: item["5. volume"] ? parseFloat(item["5. volume"]) : undefined,
      source: "alpha_vantage",
    }))
    .filter((bar) => bar.date >= cutoffDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

function mapSymbol(symbol: string): { fromSymbol: string; toSymbol: string } {
  if (symbol === "USDCNH" || symbol === "USDCNY") return { fromSymbol: "USD", toSymbol: "CNH" }
  return { fromSymbol: symbol.slice(0, 3), toSymbol: symbol.slice(3) }
}
