import { prisma } from "../src/utils/db.js"

async function main() {
  const count = await prisma.normalizedMarketSnapshot.count({
    where: { symbol: "USDCNH" }
  })
  console.log("Total USDCNH bars:", count)
  
  const bySource = await prisma.normalizedMarketSnapshot.groupBy({
    by: ["source"],
    where: { symbol: "USDCNH" },
    _count: true,
  })
  console.log("By source:", JSON.stringify(bySource, null, 2))
  
  const latest = await prisma.normalizedMarketSnapshot.findFirst({
    where: { symbol: "USDCNH" },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true, source: true },
  })
  const oldest = await prisma.normalizedMarketSnapshot.findFirst({
    where: { symbol: "USDCNH" },
    orderBy: { snapshotDate: "asc" },
    select: { snapshotDate: true, source: true },
  })
  console.log("Date range:", oldest?.snapshotDate.toISOString().slice(0,10), "to", latest?.snapshotDate.toISOString().slice(0,10))
  
  await prisma.$disconnect()
}
main()
