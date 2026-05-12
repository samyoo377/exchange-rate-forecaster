import YahooFinance from "yahoo-finance2"
import type { QuantBar } from "../types.js"

const yf = new YahooFinance()

interface YahooQuote {
  date: Date
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

export async function fetchFromYahoo(symbol: string, days = 120): Promise<QuantBar[]> {
  const yahooSymbol = mapToYahooSymbol(symbol)
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const result = await yf.chart(yahooSymbol, {
    period1: startDate,
    period2: endDate,
    interval: "1d",
  }) as { quotes: YahooQuote[] }

  if (!result.quotes || result.quotes.length === 0) {
    throw new Error(`Yahoo Finance returned no data for ${yahooSymbol}`)
  }

  return result.quotes
    .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
    .map((q) => ({
      date: new Date(q.date),
      open: q.open!,
      high: q.high!,
      low: q.low!,
      close: q.close!,
      volume: q.volume ?? undefined,
      source: "yahoo_finance",
    }))
}

function mapToYahooSymbol(symbol: string): string {
  if (symbol === "USDCNH" || symbol === "USDCNY") return "CNY=X"
  if (symbol === "EURUSD") return "EURUSD=X"
  if (symbol === "GBPUSD") return "GBPUSD=X"
  if (symbol === "USDJPY") return "JPY=X"
  return `${symbol.slice(3)}${symbol.slice(0, 3)}=X`
}
