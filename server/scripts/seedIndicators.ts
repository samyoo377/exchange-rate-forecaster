import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function seedIndicators() {
  const oscGroup = await prisma.indicatorGroup.upsert({
    where: { name: "oscillators" },
    create: { name: "oscillators", displayName: "震荡指标", description: "Oscillator Indicators", sortOrder: 1, icon: "wave", color: "#6366f1" },
    update: { displayName: "震荡指标", sortOrder: 1 },
  })

  const maGroup = await prisma.indicatorGroup.upsert({
    where: { name: "moving_averages" },
    create: { name: "moving_averages", displayName: "移动平均线", description: "Moving Averages", sortOrder: 2, icon: "trending", color: "#10b981" },
    update: { displayName: "移动平均线", sortOrder: 2 },
  })

  const pivotGroup = await prisma.indicatorGroup.upsert({
    where: { name: "pivot_points" },
    create: { name: "pivot_points", displayName: "轴枢点（经典）", description: "Classic Pivot Points", sortOrder: 3, icon: "target", color: "#f59e0b" },
    update: { displayName: "轴枢点（经典）", sortOrder: 3 },
  })

  const oscillators = [
    { indicatorType: "RSI", displayName: "RSI (14) - 相对强弱指标", category1: "oscillator", params: { period: 14 }, signalThresholds: { buy: "value < 30 && value > prev", sell: "value > 70 && value < prev", neutral: "default" } },
    { indicatorType: "STOCH", displayName: "Stochastic %K (14,3,3) - 随机指标", category1: "oscillator", params: { period: 14, smoothK: 3, smoothD: 3 }, signalThresholds: { buy: "k < 20 && d < 20 && k > d", sell: "k > 80 && d > 80 && k < d", neutral: "default" } },
    { indicatorType: "CCI", displayName: "CCI (20) - 顺势指标", category1: "oscillator", params: { period: 20 }, signalThresholds: { buy: "value < -100 && value > prev", sell: "value > 100 && value < prev", neutral: "default" } },
    { indicatorType: "ADX", displayName: "ADX (14) - 平均趋向指标", category1: "oscillator", params: { period: 14 }, signalThresholds: { buy: "plusDi > minusDi && adx > 20 && adx > prev", sell: "plusDi < minusDi && adx > 20 && adx > prev", neutral: "default" } },
    { indicatorType: "AO", displayName: "AO - 动量震荡指标", category1: "oscillator", params: { shortPeriod: 5, longPeriod: 34 }, signalThresholds: { buy: "crossAboveZero || (value > 0 && value > prev && prev < prevPrev)", sell: "crossBelowZero || (value < 0 && value < prev && prev > prevPrev)", neutral: "default" } },
    { indicatorType: "MOM", displayName: "Momentum (10) - 动量指标", category1: "oscillator", params: { period: 10 }, signalThresholds: { buy: "value > prev", sell: "value < prev", neutral: "value == prev" } },
    { indicatorType: "MACD", displayName: "MACD (12,26,9) - MACD等级", category1: "oscillator", params: { fast: 12, slow: 26, signal: 9 }, signalThresholds: { buy: "macd > signal", sell: "macd < signal", neutral: "macd == signal" } },
    { indicatorType: "STOCH_RSI", displayName: "Stochastic RSI (3,3,14,14) - 随机RSI", category1: "oscillator", params: { rsiPeriod: 14, stochPeriod: 14, kSmooth: 3, dSmooth: 3 }, signalThresholds: { buy: "downtrend && k < 20 && d < 20 && k > d", sell: "uptrend && k > 80 && d > 80 && k < d", neutral: "default" } },
    { indicatorType: "WILLIAMS_R", displayName: "Williams %R (14) - 威廉指标", category1: "oscillator", params: { period: 14 }, signalThresholds: { buy: "value < -80 && value > prev", sell: "value > -20 && value < prev", neutral: "default" } },
    { indicatorType: "BBP", displayName: "Bull Bear Power - 牛熊力度指标", category1: "oscillator", params: { period: 13 }, signalThresholds: { buy: "uptrend && bearPower < 0 && bearPower > prev", sell: "downtrend && bullPower > 0 && bullPower < prev", neutral: "default" } },
    { indicatorType: "UO", displayName: "Ultimate Oscillator (7,14,28) - 终极震荡指标", category1: "oscillator", params: { p1: 7, p2: 14, p3: 28 }, signalThresholds: { buy: "value > 70", sell: "value < 30", neutral: "default" } },
  ]

  for (const ind of oscillators) {
    await prisma.indicatorConfig.upsert({
      where: { indicatorType: ind.indicatorType },
      create: { ...ind, groupId: oscGroup.id, params: JSON.stringify(ind.params), signalThresholds: JSON.stringify(ind.signalThresholds), chartType: "line", subChart: true },
      update: { displayName: ind.displayName, category1: ind.category1, groupId: oscGroup.id, params: JSON.stringify(ind.params), signalThresholds: JSON.stringify(ind.signalThresholds) },
    })
  }

  const movingAverages = [
    { indicatorType: "EMA_10", displayName: "EMA (10) - 指数移动平均线", params: { period: 10 } },
    { indicatorType: "EMA_20", displayName: "EMA (20) - 指数移动平均线", params: { period: 20 } },
    { indicatorType: "EMA_30", displayName: "EMA (30) - 指数移动平均线", params: { period: 30 } },
    { indicatorType: "EMA_50", displayName: "EMA (50) - 指数移动平均线", params: { period: 50 } },
    { indicatorType: "EMA_100", displayName: "EMA (100) - 指数移动平均线", params: { period: 100 } },
    { indicatorType: "EMA_200", displayName: "EMA (200) - 指数移动平均线", params: { period: 200 } },
    { indicatorType: "SMA_10", displayName: "SMA (10) - 简单移动平均线", params: { period: 10 } },
    { indicatorType: "SMA_20", displayName: "SMA (20) - 简单移动平均线", params: { period: 20 } },
    { indicatorType: "SMA_30", displayName: "SMA (30) - 简单移动平均线", params: { period: 30 } },
    { indicatorType: "SMA_50", displayName: "SMA (50) - 简单移动平均线", params: { period: 50 } },
    { indicatorType: "SMA_100", displayName: "SMA (100) - 简单移动平均线", params: { period: 100 } },
    { indicatorType: "SMA_200", displayName: "SMA (200) - 简单移动平均线", params: { period: 200 } },
    { indicatorType: "VWMA", displayName: "VWMA (20) - 成交量加权移动均线", params: { period: 20 } },
    { indicatorType: "HMA", displayName: "HMA (9) - 船体移动平均线", params: { period: 9 } },
    { indicatorType: "ICHIMOKU", displayName: "Ichimoku (9,26,52) - 一目均衡表", params: { tenkan: 9, kijun: 26, senkou: 52 } },
  ]

  const maSignal = JSON.stringify({ buy: "value < price", sell: "value > price", neutral: "value == price" })
  const ichSignal = JSON.stringify({ buy: "senkouA > senkouB && price > tenkan && tenkan > kijun && price > senkouA", sell: "senkouA < senkouB && price < tenkan && tenkan < kijun && price < senkouA", neutral: "default" })

  for (const ma of movingAverages) {
    const signal = ma.indicatorType === "ICHIMOKU" ? ichSignal : maSignal
    await prisma.indicatorConfig.upsert({
      where: { indicatorType: ma.indicatorType },
      create: { indicatorType: ma.indicatorType, displayName: ma.displayName, category1: "moving_average", groupId: maGroup.id, params: JSON.stringify(ma.params), signalThresholds: signal, chartType: "line", subChart: false },
      update: { displayName: ma.displayName, category1: "moving_average", groupId: maGroup.id, params: JSON.stringify(ma.params), signalThresholds: signal },
    })
  }

  const pivotSignal = JSON.stringify({ buy: "price < level", sell: "price > level", neutral: "default" })
  await prisma.indicatorConfig.upsert({
    where: { indicatorType: "PIVOT" },
    create: { indicatorType: "PIVOT", displayName: "Pivot Points (经典) - 轴枢点", category1: "pivot_point", groupId: pivotGroup.id, params: JSON.stringify({}), signalThresholds: pivotSignal, chartType: "line", subChart: false },
    update: { displayName: "Pivot Points (经典) - 轴枢点", category1: "pivot_point", groupId: pivotGroup.id, signalThresholds: pivotSignal },
  })

  console.log(`Seeded: ${oscillators.length} oscillators, ${movingAverages.length} moving averages, 1 pivot point config`)
  console.log(`Groups: ${oscGroup.id}, ${maGroup.id}, ${pivotGroup.id}`)
}

seedIndicators()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
