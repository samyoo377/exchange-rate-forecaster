import { getDashboard } from "../src/services/dashboard/dashboardService.js"

async function main() {
  const result = await getDashboard("USDCNH", "1d")
  if (!result) { console.log("No data"); process.exit(0) }
  
  console.log("series length:", result.series.length)
  
  const latest = result.indicators as any
  const maKeys = ["ema10", "ema20", "ema30", "ema50", "ema100", "ema200", "sma10", "sma20", "sma30", "sma50", "sma100", "sma200", "vwma", "hma", "ichTenkan", "ichKijun", "ichSenkouA", "ichSenkouB"]
  
  console.log("\n=== MA indicators in latest ===")
  for (const k of maKeys) {
    const v = latest[k]
    console.log(`  ${k}: ${v !== undefined ? Number(v).toFixed(4) : "undefined"}`)
  }
  
  const pivotKeys = ["pivotPP", "pivotR1", "pivotR2", "pivotR3", "pivotS1", "pivotS2", "pivotS3"]
  console.log("\n=== Pivot indicators ===")
  for (const k of pivotKeys) {
    console.log(`  ${k}: ${latest[k] !== undefined ? Number(latest[k]).toFixed(4) : "undefined"}`)
  }
  
  process.exit(0)
}
main()
