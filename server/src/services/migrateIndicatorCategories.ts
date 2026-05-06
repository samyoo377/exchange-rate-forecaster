import { prisma } from "../utils/db.js"

const CATEGORY_MAP: Record<string, { category1: string; category2: string }> = {
  RSI:   { category1: "momentum",       category2: "oscillator" },
  STOCH: { category1: "momentum",       category2: "oscillator" },
  CCI:   { category1: "momentum",       category2: "oscillator" },
  ADX:   { category1: "trend",          category2: "trend_strength" },
  AO:    { category1: "momentum",       category2: "rate" },
  MOM:   { category1: "momentum",       category2: "rate" },
}

export async function migrateIndicatorCategories() {
  const configs = await prisma.indicatorConfig.findMany()
  let updated = 0

  for (const config of configs) {
    const mapping = CATEGORY_MAP[config.indicatorType]
    if (!mapping) continue
    if (config.category1 !== "custom") continue

    await prisma.indicatorConfig.update({
      where: { id: config.id },
      data: {
        category1: mapping.category1,
        category2: mapping.category2,
      },
    })
    updated++
  }

  if (updated > 0) {
    console.log(`[Migration] Updated categories for ${updated} indicator configs`)
  }
}
