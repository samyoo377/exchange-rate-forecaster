import axios from "axios"

export interface RateDataPoint {
  date: string
  rate: number
}

export interface RateTrendResult {
  ccyPair: string
  queryType: string
  data: RateDataPoint[]
  currentRate: number
  currentDateTime: string
}

const API_URL = `${process.env.RATE_DATA_DOMAIN}/api/fx/quote_trend_chart`

function getHeaders() {
  const mId = process.env.RATE_DATA_M_ID
  const merchantId = process.env.RATE_DATA_MERCHANT_ID
  const signBusinessId = process.env.RATE_DATA_SIGN_BUSINESS_ID
  const cookie = process.env.RATE_DATA_COOKIE

  if (!mId || !merchantId || !signBusinessId || !cookie) {
    throw new Error("RATE_DATA_* 环境变量未配置完整")
  }

  return {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9",
    "authorization": "true",
    "content-type": "application/json",
    "m_id": mId,
    "merchantid": merchantId,
    "signbusinessid": signBusinessId,
    "x-locale": "zh-CN",
    "cookie": cookie,
  }
}

export async function fetchRateTrend(
  queryType: "D" | "W" | "M" = "M",
  baseCurrency: "USD" | "CNH" = "USD",
): Promise<RateTrendResult> {
  const ccyPair = baseCurrency === "USD" ? "USD/CNH" : "CNH/USD"

  const response = await axios.post(
    API_URL,
    {
      ccy_pair: ccyPair,
      query_type: queryType,
      base_currency: baseCurrency,
      business_scope: "B2C",
    },
    { headers: getHeaders(), timeout: 15000 },
  )

  if (response.data?.code !== 0) {
    throw new Error(`xxx API 返回错误: ${response.data?.msg ?? "未知错误"}`)
  }

  const rawData = response.data.data
  const chartList = rawData?.quote_chart_data_list ?? []

  const data: RateDataPoint[] = chartList.map((item: any) => ({
    date: item.quote_date_time,
    rate: parseFloat(item.quote_data),
  }))

  return {
    ccyPair,
    queryType,
    data,
    currentRate: parseFloat(rawData.current_quote_data),
    currentDateTime: rawData.current_quote_date_time,
  }
}

export function aggregateDailyRates(data: RateDataPoint[]): RateDataPoint[] {
  const dailyMap = new Map<string, { sum: number; count: number; last: number }>()

  for (const point of data) {
    const day = point.date.slice(0, 10)
    const existing = dailyMap.get(day)
    if (existing) {
      existing.sum += point.rate
      existing.count++
      existing.last = point.rate
    } else {
      dailyMap.set(day, { sum: point.rate, count: 1, last: point.rate })
    }
  }

  return Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { last }]) => ({ date: day, rate: last }))
}

export function computeMovingAverage(data: RateDataPoint[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null
    const slice = data.slice(i - period + 1, i + 1)
    const avg = slice.reduce((sum, p) => sum + p.rate, 0) / period
    return Math.round(avg * 10000) / 10000
  })
}
