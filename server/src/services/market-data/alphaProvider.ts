import axios from "axios"
import { prisma } from "../../utils/db.js"
import { genVersion } from "../../utils/helpers.js"
import type { OhlcBar } from "../../types/index.js"

const ALPHA_BASE = "https://www.alphavantage.co/query"

interface AlphaTimeSeriesItem {
  "1. open": string
  "2. high": string
  "3. low": string
  "4. close": string
  "5. volume"?: string
}

export async function fetchFromAlphaVantage(symbol: string): Promise<OhlcBar[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY
  if (!apiKey) throw new Error("ALPHA_VANTAGE_API_KEY not set")

  const response = await axios.get(ALPHA_BASE, {
    params: {
      function: "FX_DAILY",
      from_symbol: symbol.slice(0, 3),
      to_symbol: symbol.slice(3),
      outputsize: "compact",
      apikey: apiKey,
    },
    timeout: 15000,
  })

  const raw = response.data as Record<string, unknown>
  const timeSeries = raw["Time Series FX (Daily)"] as Record<string, AlphaTimeSeriesItem> | undefined

  if (!timeSeries) {
    const info = (raw["Information"] ?? raw["Note"]) as string | undefined
    throw new Error(info ?? "Alpha Vantage returned unexpected format")
  }

  const version = genVersion(symbol)
  const bars: OhlcBar[] = Object.entries(timeSeries).map(([dateStr, item]) => ({
    symbol,
    tradeDate: new Date(dateStr),
    open: parseFloat(item["1. open"]),
    high: parseFloat(item["2. high"]),
    low: parseFloat(item["3. low"]),
    close: parseFloat(item["4. close"]),
    volume: item["5. volume"] ? parseFloat(item["5. volume"]) : undefined,
    source: "alpha_vantage",
    version,
  }))

  await prisma.rawMarketData.create({
    data: {
      source: "alpha_vantage",
      symbol,
      payload: JSON.stringify(timeSeries),
      fetchedAt: new Date(),
      status: "success",
    },
  })

  return bars
}

export async function upsertSnapshots(bars: OhlcBar[]): Promise<number> {
  let inserted = 0
  for (const bar of bars) {
    if (bar.high < bar.low || bar.open < bar.low || bar.close < bar.low) continue

    const isSynthetic = bar.source === "frankfurter" || bar.source === "ecb"
    if (isSynthetic) {
      const existing = await prisma.normalizedMarketSnapshot.findFirst({
        where: {
          symbol: bar.symbol,
          snapshotDate: bar.tradeDate,
          source: { notIn: ["frankfurter", "ecb"] },
        },
      })
      if (existing) continue
    }

    try {
      await prisma.normalizedMarketSnapshot.upsert({
        where: {
          symbol_snapshotDate_version: {
            symbol: bar.symbol,
            snapshotDate: bar.tradeDate,
            version: bar.version,
          },
        },
        update: {},
        create: {
          symbol: bar.symbol,
          snapshotDate: bar.tradeDate,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          source: bar.source,
          version: bar.version,
        },
      })
      inserted++
    } catch (_) {
      // skip duplicates
    }
  }
  return inserted
}
