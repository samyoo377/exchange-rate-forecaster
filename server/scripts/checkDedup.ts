import { prisma } from "../src/utils/db.js"

async function main() {
  const rows = await prisma.normalizedMarketSnapshot.findMany({
    where: { symbol: "USDCNH" },
    orderBy: { snapshotDate: "desc" },
    take: 6000,
  })
  console.log("Raw rows fetched:", rows.length)
  
  const byDate = new Map<string, typeof rows[0]>()
  const SOURCE_PRIORITY: Record<string, number> = { excel: 1, alpha_vantage: 2, yahoo_finance: 3, frankfurter: 4, ecb: 5 }

  for (const r of rows) {
    const key = r.snapshotDate.toISOString()
    const existing = byDate.get(key)
    if (!existing) {
      byDate.set(key, r)
    } else {
      const existingPri = SOURCE_PRIORITY[existing.source] ?? 5
      const newPri = SOURCE_PRIORITY[r.source] ?? 5
      if (newPri < existingPri) {
        byDate.set(key, r)
      }
    }
  }
  
  const deduped = [...byDate.values()].sort(
    (a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime(),
  )
  console.log("After dedup:", deduped.length)
  
  // Check source distribution
  const srcCount: Record<string, number> = {}
  for (const r of deduped) {
    srcCount[r.source] = (srcCount[r.source] ?? 0) + 1
  }
  console.log("Deduped by source:", srcCount)
  
  // Check date range
  console.log("First:", deduped[0]?.snapshotDate.toISOString().slice(0,10))
  console.log("Last:", deduped[deduped.length-1]?.snapshotDate.toISOString().slice(0,10))
  
  // Check if excel data has hourly entries
  const excelRows = deduped.filter(r => r.source === "excel")
  if (excelRows.length > 2) {
    const diff = excelRows[1].snapshotDate.getTime() - excelRows[0].snapshotDate.getTime()
    console.log("Excel interval (ms):", diff, "=", diff / 3600000, "hours")
  }
  
  await prisma.$disconnect()
}
main()
