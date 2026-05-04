import "dotenv/config"
import "../config/mysql.js"
import { prisma } from "../utils/db.js"
import { parseExcelFile } from "../services/file-ingestion/excelParser.js"
import { upsertSnapshots } from "../services/market-data/alphaProvider.js"
import * as path from "path"

const PROJECT_ROOT = path.resolve(process.cwd(), "..")

async function seedMarketData() {
  const excelPath = path.resolve(PROJECT_ROOT, process.env.DATA_IMPORT_DEFAULT_PATH ?? "./USDCNH-BBG-20Days.xlsx")
  const symbol = process.env.DEFAULT_SYMBOL ?? "USDCNH"
  console.log(`[Seed] Parsing Excel: ${excelPath}`)
  const bars = parseExcelFile(excelPath, symbol)
  console.log(`[Seed] Parsed ${bars.length} bars`)
  if (bars.length > 0) {
    const inserted = await upsertSnapshots(bars)
    console.log(`[Seed] Inserted ${inserted} snapshots`)
  }
}

async function seedNewsSources() {
  const sources = [
    { name: "sina_finance", url: "https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&k=&num=30&page=1&r=0.1", type: "json-api", category: "finance" },
    { name: "wallstreetcn", url: "https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=30", type: "json-api", category: "finance" },
    { name: "10jqka", url: "https://news.10jqka.com.cn/tapp/news/push/stock/?page=1&tag=&track=website&num=30", type: "json-api", category: "finance" },
    // API changed or blocked — disabled
    { name: "jin10", url: "https://flash-api.jin10.com/get_flash_list?channel=-8200&vip=1", type: "json-api", category: "finance", enabled: false },
    { name: "eastmoney_news", url: "https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?columns=102&pageSize=30&type=0", type: "json-api", category: "finance", enabled: false },
    { name: "cls_telegraph", url: "https://www.cls.cn/nodeapi/updateTelegraph?app=CailianpressWeb&os=web&sv=8.4.6&rn=20", type: "json-api", category: "finance", enabled: false },
    { name: "fx168", url: "https://api-new.fx168news.com/api/v1/news/list?cate_id=1&page=1&pagesize=30", type: "json-api", category: "forex", enabled: false },
    // Blocked by GFW - disabled
    { name: "reuters_fx", url: "https://rsshub.app/reuters/category/markets", type: "rss", category: "forex", enabled: false },
    { name: "bloomberg", url: "https://rsshub.app/bloomberg/markets", type: "rss", category: "finance", enabled: false },
    { name: "bbc_business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", type: "rss", category: "economy", enabled: false },
    { name: "twitter_trump", url: "https://nitter.net/realDonaldTrump/rss", type: "twitter", category: "macro", enabled: false },
    { name: "twitter_wsj", url: "https://nitter.net/WSJ/rss", type: "twitter", category: "finance", enabled: false },
    { name: "twitter_bloomberg", url: "https://nitter.net/Bloomberg/rss", type: "twitter", category: "finance", enabled: false },
  ]

  for (const s of sources) {
    await prisma.newsSource.upsert({
      where: { name: s.name },
      update: { url: s.url, type: s.type, category: s.category, enabled: s.enabled ?? true },
      create: {
        name: s.name,
        url: s.url,
        type: s.type,
        category: s.category,
        enabled: s.enabled ?? true,
      },
    })
  }

  // Remove old broken sources
  const activeNames = sources.map((s) => s.name)
  await prisma.newsSource.deleteMany({
    where: { name: { notIn: activeNames } },
  }).catch(() => {})

  console.log(`[Seed] Upserted ${sources.length} news sources`)
}

async function seedIndicatorConfigs() {
  const configs = [
    {
      indicatorType: "RSI",
      displayName: "RSI (相对强弱指数)",
      description: "衡量价格变动的速度和幅度，判断超买超卖状态。RSI < 30 视为超卖（看多），> 70 视为超买（看空）。",
      formulaLatex: "RSI = 100 - \\frac{100}{1 + RS}, \\quad RS = \\frac{AvgGain(n)}{AvgLoss(n)}",
      params: JSON.stringify({ period: 14 }),
      signalThresholds: JSON.stringify({ buyBelow: 30, sellAbove: 70 }),
    },
    {
      indicatorType: "STOCH",
      displayName: "Stochastic (随机振荡器)",
      description: "比较收盘价与一段时期内价格范围的位置。%K < 20 为超卖，> 80 为超买。",
      formulaLatex: "\\%K = \\frac{C - L_n}{H_n - L_n} \\times 100, \\quad \\%D = SMA(\\%K, m)",
      params: JSON.stringify({ period: 14, smoothK: 3 }),
      signalThresholds: JSON.stringify({ buyBelow: 20, sellAbove: 80 }),
    },
    {
      indicatorType: "CCI",
      displayName: "CCI (商品通道指数)",
      description: "衡量价格偏离统计均值的程度。CCI < -100 视为超卖看多，> 100 视为超买看空。",
      formulaLatex: "CCI = \\frac{TP - SMA(TP, n)}{0.015 \\times MD}",
      params: JSON.stringify({ period: 20 }),
      signalThresholds: JSON.stringify({ buyBelow: -100, sellAbove: 100 }),
    },
    {
      indicatorType: "ADX",
      displayName: "ADX (平均趋向指数)",
      description: "衡量趋势强度。ADX > 25 表示趋势强劲（信号可信度高），< 20 表示弱趋势。不判断方向，结合 +DI/-DI 判断。",
      formulaLatex: "ADX = SMA(DX, n), \\quad DX = \\frac{|+DI - (-DI)|}{+DI + (-DI)} \\times 100",
      params: JSON.stringify({ period: 14 }),
      signalThresholds: JSON.stringify({ strongTrendAbove: 25, weakTrendBelow: 20, bullishMultiplier: 1.2, bearishMultiplier: 0.8 }),
    },
    {
      indicatorType: "AO",
      displayName: "AO (动量震荡指标)",
      description: "短期SMA与长期SMA之差。正值且上升看多，负值且下降看空，零线穿越为信号。",
      formulaLatex: "AO = SMA(\\frac{H+L}{2}, s) - SMA(\\frac{H+L}{2}, l)",
      params: JSON.stringify({ shortPeriod: 5, longPeriod: 34 }),
      signalThresholds: JSON.stringify({ zeroCross: true }),
    },
    {
      indicatorType: "MOM",
      displayName: "MOM (动量指标)",
      description: "当前价格与 n 期前价格之差。> 0 看多，< 0 看空。",
      formulaLatex: "MOM = C_t - C_{t-n}",
      params: JSON.stringify({ period: 10 }),
      signalThresholds: JSON.stringify({ zeroCross: true }),
    },
  ]

  for (const c of configs) {
    await prisma.indicatorConfig.upsert({
      where: { indicatorType: c.indicatorType },
      update: { displayName: c.displayName, description: c.description, formulaLatex: c.formulaLatex },
      create: { ...c, weight: 1.0, enabled: true },
    })
  }
  console.log(`[Seed] Upserted ${configs.length} indicator configs`)
}

async function main() {
  try {
    await seedNewsSources()
    await seedIndicatorConfigs()
    await seedMarketData()
  } catch (e) {
    console.error("[Seed] Error:", e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
