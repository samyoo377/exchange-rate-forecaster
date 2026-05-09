import { defineStore } from "pinia"
import { ref } from "vue"
import { getLatestNewsDigest, triggerNewsDigest } from "../api/index"
import type { NewsDigest } from "../api/index"

export const useNewsStore = defineStore("news", () => {
  const digest = ref<NewsDigest | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const triggering = ref(false)

  async function fetchDigest(symbol = "USDCNH") {
    loading.value = true
    error.value = null
    try {
      digest.value = await getLatestNewsDigest(symbol)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function triggerRefresh(symbol = "USDCNH") {
    triggering.value = true
    error.value = null
    try {
      await triggerNewsDigest(symbol)
      await fetchDigest(symbol)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      triggering.value = false
    }
  }

  return { digest, loading, error, triggering, fetchDigest, triggerRefresh }
})
