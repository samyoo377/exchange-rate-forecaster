import { defineStore } from "pinia"
import { ref, computed } from "vue"
import type { DashboardData } from "../types/index"
import { getDashboard, refreshData } from "../api/index"

export const useMarketStore = defineStore("market", () => {
  const dashboard = ref<DashboardData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const symbol = ref("USDCNH")

  const series = computed(() => dashboard.value?.series ?? [])
  const indicators = computed(() => dashboard.value?.indicators ?? {})
  const lastUpdatedAt = computed(() => dashboard.value?.lastUpdatedAt ?? null)
  const latestPrediction = computed(() => dashboard.value?.latestPrediction ?? null)

  async function fetchDashboard() {
    loading.value = true
    error.value = null
    try {
      dashboard.value = await getDashboard(symbol.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
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

  return { dashboard, loading, error, symbol, series, indicators, lastUpdatedAt, latestPrediction, fetchDashboard, refresh }
})
