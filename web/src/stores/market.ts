import { defineStore } from "pinia"
import { ref, computed } from "vue"
import type { DashboardData } from "../types/index"
import { getDashboard, refreshData, getLatestNewsDigest, getIndicatorConfigs, getRateTrend } from "../api/index"
import type { NewsDigest, IndicatorConfigInfo, RateTrendData } from "../api/index"

export const useMarketStore = defineStore("market", () => {
  const dashboard = ref<DashboardData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const symbol = ref("USDCNH")
  const interval = ref("1d")
  const newsDigest = ref<NewsDigest | null>(null)
  const indicatorConfigs = ref<IndicatorConfigInfo[]>([])
  const rateTrend = ref<RateTrendData | null>(null)

  const series = computed(() => dashboard.value?.series ?? [])
  const indicators = computed(() => dashboard.value?.indicators ?? {})
  const lastUpdatedAt = computed(() => dashboard.value?.lastUpdatedAt ?? null)
  const latestPrediction = computed(() => dashboard.value?.latestPrediction ?? null)

  async function fetchDashboard() {
    loading.value = true
    error.value = null
    try {
      const [dash, digest, configs, trend] = await Promise.all([
        getDashboard(symbol.value, interval.value),
        getLatestNewsDigest(symbol.value).catch(() => null),
        getIndicatorConfigs().catch(() => []),
        getRateTrend("M", 30).catch(() => null),
      ])
      dashboard.value = dash
      newsDigest.value = digest
      indicatorConfigs.value = configs
      rateTrend.value = trend
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function setInterval(iv: string) {
    interval.value = iv
    await fetchDashboard()
  }

  async function refresh(source = "excel") {
    loading.value = true
    error.value = null
    try {
      await refreshData(symbol.value, source)
      await fetchDashboard()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return {
    dashboard, loading, error, symbol, interval,
    series, indicators, lastUpdatedAt, latestPrediction,
    newsDigest, indicatorConfigs, rateTrend,
    fetchDashboard, setInterval, refresh,
  }
})
