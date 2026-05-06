import RssParser from "rss-parser"
import axios from "axios"
import * as cheerio from "cheerio"
import { prisma } from "../../utils/db.js"
import type { NewsSource as NewsSourceRow } from "@prisma/client"
import { parseCurlCommand } from "./curlParser.js"

const rssParser = new RssParser({ timeout: 15_000 })

const JSON_API_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
}

interface RawNewsItem {
  source: string
  title: string
  url: string
  summary?: string
  publishedAt?: Date
  category?: string
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim()
}

function parseRssFeed(sourceName: string, category: string, feed: RssParser.Output<any>): RawNewsItem[] {
  return (feed.items ?? []).map((item) => ({
    source: sourceName,
    title: (item.title ?? "").trim(),
    url: (item.link ?? "").trim(),
    summary: (item.contentSnippet ?? item.content ?? "").slice(0, 1000),
    publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
    category,
  }))
}

function parseJin10(data: any): RawNewsItem[] {
  const items = data?.data ?? []
  return items
    .filter((item: any) => item.type === 0 && item.data?.content)
    .slice(0, 30)
    .map((item: any) => ({
      source: "jin10",
      title: stripHtml(item.data.content).slice(0, 200),
      url: `https://www.jin10.com/flash_detail/${item.id}.html`,
      summary: stripHtml(item.data.content).slice(0, 1000),
      publishedAt: item.time ? new Date(item.time) : undefined,
      category: "finance",
    }))
}

function parseEastmoney(data: any, sourceName: string): RawNewsItem[] {
  const list = data?.data?.list ?? data?.data ?? []
  if (!Array.isArray(list)) return []
  return list.slice(0, 30).map((item: any) => ({
    source: sourceName,
    title: stripHtml(String(item.title ?? item.Art_Title ?? "")).slice(0, 200),
    url: String(item.url ?? item.Art_Url ?? `https://finance.eastmoney.com/${item.Art_UniqueUrl ?? item.id}.html`),
    summary: stripHtml(String(item.digest ?? item.Art_Content ?? item.content ?? "")).slice(0, 1000),
    publishedAt: item.showtime ?? item.Art_CreateTime ? new Date(item.showtime ?? item.Art_CreateTime) : undefined,
    category: "finance",
  }))
}

function parseSinaFinance(data: any, sourceName: string): RawNewsItem[] {
  const list = data?.result?.data ?? []
  if (!Array.isArray(list)) return []
  return list.slice(0, 30).map((item: any) => ({
    source: sourceName,
    title: stripHtml(String(item.title ?? "")).slice(0, 200),
    url: String(item.url ?? ""),
    summary: stripHtml(String(item.intro ?? item.summary ?? "")).slice(0, 1000),
    publishedAt: item.ctime ? new Date(item.ctime * 1000) : item.createtime ? new Date(item.createtime) : undefined,
    category: "finance",
  }))
}

function parseClsTelegraph(data: any, sourceName: string): RawNewsItem[] {
  const list = data?.data?.roll_data ?? data?.data ?? []
  if (!Array.isArray(list)) return []
  return list.slice(0, 30).map((item: any) => ({
    source: sourceName,
    title: stripHtml(String(item.title ?? item.content ?? item.brief ?? "")).slice(0, 200),
    url: item.shareurl ?? `https://www.cls.cn/detail/${item.id}`,
    summary: stripHtml(String(item.content ?? item.brief ?? "")).slice(0, 1000),
    publishedAt: item.ctime ? new Date(item.ctime * 1000) : undefined,
    category: "finance",
  }))
}

function parse10jqka(data: any, sourceName: string): RawNewsItem[] {
  const list = data?.data?.list ?? []
  if (!Array.isArray(list)) return []
  return list.slice(0, 30).map((item: any) => ({
    source: sourceName,
    title: stripHtml(String(item.title ?? "")).slice(0, 200),
    url: String(item.url ?? item.shareUrl ?? ""),
    summary: stripHtml(String(item.digest ?? item.short ?? "")).slice(0, 1000),
    publishedAt: item.ctime ? new Date(Number(item.ctime) * 1000) : undefined,
    category: "finance",
  }))
}

function parseWallstreetcn(data: any, sourceName: string): RawNewsItem[] {
  const list = data?.data?.items ?? []
  if (!Array.isArray(list)) return []
  return list.slice(0, 30).map((item: any) => ({
    source: sourceName,
    title: stripHtml(String(item.title ?? item.content_text ?? "")).slice(0, 200),
    url: item.uri ? `https://wallstreetcn.com/live/${item.id}` : `https://wallstreetcn.com/articles/${item.id}`,
    summary: stripHtml(String(item.content_text ?? item.content ?? "")).slice(0, 1000),
    publishedAt: item.display_time ? new Date(item.display_time * 1000) : undefined,
    category: "finance",
  }))
}

function truncate(str: string | undefined, maxLen: number): string | undefined {
  if (!str) return undefined
  return str.length > maxLen ? str.slice(0, maxLen) + "...[truncated]" : str
}

async function fetchRssSource(source: NewsSourceRow): Promise<{ items: RawNewsItem[]; responseBody?: string }> {
  const feed = await rssParser.parseURL(source.url)
  const items = parseRssFeed(source.name, source.category, feed)
  const responseBody = truncate(JSON.stringify(feed), 10_000)
  return { items, responseBody }
}

async function fetchJsonApiSource(source: NewsSourceRow): Promise<{ items: RawNewsItem[]; responseBody?: string; status?: number }> {
  const { data, status } = await axios.get(source.url, {
    timeout: 15_000,
    headers: JSON_API_HEADERS,
  })
  const responseBody = truncate(JSON.stringify(data), 10_000)

  let items: RawNewsItem[]
  const name = source.name.toLowerCase()

  if (name === "jin10") {
    items = parseJin10(data)
  } else if (name.includes("eastmoney")) {
    items = parseEastmoney(data, source.name)
  } else if (name.includes("sina")) {
    items = parseSinaFinance(data, source.name)
  } else if (name.includes("cls")) {
    items = parseClsTelegraph(data, source.name)
  } else if (name.includes("10jqka")) {
    items = parse10jqka(data, source.name)
  } else if (name.includes("wallstreet")) {
    items = parseWallstreetcn(data, source.name)
  } else {
    const arr = Array.isArray(data) ? data : (data?.data?.list ?? data?.data ?? data?.items ?? [])
    const list = Array.isArray(arr) ? arr : []
    items = list.slice(0, 50).map((item: any) => ({
      source: source.name,
      title: stripHtml(String(item.title ?? item.headline ?? "")).slice(0, 200),
      url: String(item.url ?? item.link ?? ""),
      summary: stripHtml(String(item.summary ?? item.description ?? item.content ?? "")).slice(0, 1000),
      publishedAt: item.publishedAt || item.pubDate || item.ctime
        ? new Date(typeof item.ctime === "number" ? item.ctime * 1000 : (item.publishedAt || item.pubDate))
        : undefined,
      category: source.category,
    }))
  }
  return { items, responseBody, status }
}

interface HeadlessBrowserConfig {
  itemSelector: string
  titleSelector: string
  urlSelector: string
  summarySelector?: string
  waitSelector?: string
  token?: string
  tokenHeader?: string
  headers?: Record<string, string>
}

interface CurlConfig {
  curlCommand?: string
  method?: string
  headers?: Record<string, string>
  body?: string
  parseType?: "json-api" | "rss" | "html"
  itemSelector?: string
  titleSelector?: string
  urlSelector?: string
  summarySelector?: string
  jsonPath?: string
  tokenExpiresAt?: string
}

function getParseConfig<T>(source: NewsSourceRow): T | null {
  if (!source.parseConfig) return null
  try { return JSON.parse(source.parseConfig) as T } catch { return null }
}

function extractItemsFromHtml(
  html: string,
  sourceName: string,
  category: string,
  baseUrl: string,
  cfg: { itemSelector: string; titleSelector: string; urlSelector: string; summarySelector?: string },
): RawNewsItem[] {
  const $ = cheerio.load(html)
  const items: RawNewsItem[] = []
  $(cfg.itemSelector).each((_, el) => {
    const $el = $(el)
    const title = stripHtml($el.find(cfg.titleSelector).text()).slice(0, 200)
    let url = $el.find(cfg.urlSelector).attr("href") ?? ""
    if (url && !url.startsWith("http")) {
      try { url = new URL(url, baseUrl).href } catch { /* keep relative */ }
    }
    const summary = cfg.summarySelector
      ? stripHtml($el.find(cfg.summarySelector).text()).slice(0, 1000)
      : undefined
    if (title && url) items.push({ source: sourceName, title, url, summary, category })
  })
  return items.slice(0, 50)
}

async function fetchHeadlessBrowserSource(
  source: NewsSourceRow,
): Promise<{ items: RawNewsItem[]; responseBody?: string; status?: number }> {
  const cfg = getParseConfig<HeadlessBrowserConfig>(source)
  if (!cfg?.itemSelector || !cfg?.titleSelector || !cfg?.urlSelector) {
    throw new Error("headless-browser 类型需要配置 itemSelector, titleSelector, urlSelector")
  }
  const headers: Record<string, string> = {
    ...JSON_API_HEADERS,
    ...cfg.headers,
  }
  if (cfg.token) {
    headers[cfg.tokenHeader ?? "Authorization"] = cfg.token
  }
  const { data: html, status } = await axios.get(source.url, {
    timeout: 30_000,
    headers,
    responseType: "text",
  })
  const items = extractItemsFromHtml(html, source.name, source.category, source.url, cfg)
  return { items, responseBody: truncate(html, 10_000), status }
}

async function fetchCurlSource(
  source: NewsSourceRow,
): Promise<{ items: RawNewsItem[]; responseBody?: string; status?: number; tokenExpired?: boolean }> {
  const cfg = getParseConfig<CurlConfig>(source)

  let tokenExpired = false
  if (cfg?.tokenExpiresAt) {
    const expiry = new Date(cfg.tokenExpiresAt)
    if (expiry.getTime() < Date.now()) {
      tokenExpired = true
      await prisma.newsSource.update({
        where: { id: source.id },
        data: { lastError: `Token 已过期 (${expiry.toLocaleDateString("zh-CN")})，请更新` },
      }).catch(() => {})
    }
  }

  let url: string
  let method: string
  let headers: Record<string, string>
  let body: string | undefined

  if (cfg?.curlCommand) {
    const parsed = parseCurlCommand(cfg.curlCommand)
    url = parsed.url
    method = parsed.method
    headers = { ...JSON_API_HEADERS, ...parsed.headers }
    body = parsed.body
  } else if (cfg?.method) {
    url = source.url
    method = cfg.method.toUpperCase()
    headers = { ...JSON_API_HEADERS, ...cfg.headers }
    body = cfg.body
  } else {
    url = source.url
    method = "GET"
    headers = { ...JSON_API_HEADERS, ...cfg?.headers }
    body = undefined
  }

  const resp = await axios({
    url, method, headers, timeout: 15_000,
    data: body,
    responseType: cfg?.parseType === "html" ? "text" : "json",
  })

  const responseBody = truncate(
    typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data),
    10_000,
  )

  let items: RawNewsItem[]

  if (cfg?.parseType === "html" && cfg.itemSelector && cfg.titleSelector && cfg.urlSelector) {
    items = extractItemsFromHtml(resp.data, source.name, source.category, url, {
      itemSelector: cfg.itemSelector, titleSelector: cfg.titleSelector,
      urlSelector: cfg.urlSelector, summarySelector: cfg.summarySelector,
    })
  } else if (cfg?.parseType === "rss" && typeof resp.data === "string") {
    const feed = await rssParser.parseString(resp.data)
    items = parseRssFeed(source.name, source.category, feed)
  } else {
    let data = resp.data
    if (cfg?.jsonPath) {
      for (const key of cfg.jsonPath.split(".")) {
        data = data?.[key]
      }
    }
    const arr = Array.isArray(data) ? data : (data?.data?.list ?? data?.data ?? data?.items ?? [])
    const list = Array.isArray(arr) ? arr : []
    items = list.slice(0, 50).map((item: any) => ({
      source: source.name,
      title: stripHtml(String(item.title ?? item.headline ?? "")).slice(0, 200),
      url: String(item.url ?? item.link ?? ""),
      summary: stripHtml(String(item.summary ?? item.description ?? item.content ?? "")).slice(0, 1000),
      publishedAt: item.publishedAt || item.pubDate || item.ctime
        ? new Date(typeof item.ctime === "number" ? item.ctime * 1000 : (item.publishedAt || item.pubDate))
        : undefined,
      category: source.category,
    }))
  }
  return { items, responseBody, status: resp.status, tokenExpired }
}

async function fetchSingleSource(source: NewsSourceRow): Promise<RawNewsItem[]> {
  const startedAt = new Date()
  let logData: {
    sourceId: string
    sourceName: string
    requestUrl: string
    requestMethod: string
    responseStatus?: number
    responseBody?: string
    fetchedCount: number
    success: boolean
    error?: string
    startedAt: Date
    finishedAt?: Date
    durationMs?: number
  } = {
    sourceId: source.id,
    sourceName: source.name,
    requestUrl: source.url,
    requestMethod: "GET",
    fetchedCount: 0,
    success: false,
    startedAt,
  }

  try {
    let items: RawNewsItem[]
    if (source.type === "rss" || source.type === "twitter") {
      const result = await fetchRssSource(source)
      items = result.items
      logData.responseBody = truncate(result.responseBody, 10_000)
      logData.responseStatus = 200
    } else if (source.type === "headless-browser") {
      const result = await fetchHeadlessBrowserSource(source)
      items = result.items
      logData.responseBody = truncate(result.responseBody, 10_000)
      logData.responseStatus = result.status
    } else if (source.type === "curl") {
      const result = await fetchCurlSource(source)
      items = result.items
      logData.responseBody = truncate(result.responseBody, 10_000)
      logData.responseStatus = result.status
      logData.requestMethod = getParseConfig<CurlConfig>(source)?.curlCommand ? "CURL" : (getParseConfig<CurlConfig>(source)?.method ?? "GET")
    } else {
      const result = await fetchJsonApiSource(source)
      items = result.items
      logData.responseBody = truncate(result.responseBody, 10_000)
      logData.responseStatus = result.status
    }

    const finishedAt = new Date()
    logData.finishedAt = finishedAt
    logData.durationMs = finishedAt.getTime() - startedAt.getTime()
    logData.fetchedCount = items.length
    logData.success = true

    await prisma.newsSource.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date(), lastError: null },
    })

    await prisma.newsFetchLog.create({ data: logData }).catch(() => {})

    return items
  } catch (e) {
    const msg = (e as Error).message
    const finishedAt = new Date()
    logData.finishedAt = finishedAt
    logData.durationMs = finishedAt.getTime() - startedAt.getTime()
    logData.error = msg
    logData.success = false

    if (axios.isAxiosError(e) && e.response) {
      logData.responseStatus = e.response.status
      logData.responseBody = truncate(
        typeof e.response.data === "string" ? e.response.data : JSON.stringify(e.response.data),
        10_000,
      )
    } else {
      logData.responseBody = truncate(
        JSON.stringify({ error: msg, type: (e as Error).constructor?.name ?? "Error" }),
        10_000,
      )
    }

    console.warn(`[NewsFetcher] Source ${source.name} failed:`, msg)

    await prisma.newsSource.update({
      where: { id: source.id },
      data: { lastError: msg },
    }).catch(() => {})

    await prisma.newsFetchLog.create({ data: logData }).catch(() => {})

    return []
  }
}

export interface FetchedItemSummary {
  title: string
  url: string
  publishedAt: string | null
  category: string | null
  isNew: boolean
}

export interface FetchSourceDetail {
  sourceName: string
  sourceId: string
  sourceType: string
  status: "success" | "error" | "skipped"
  itemCount: number
  insertedCount: number
  durationMs: number
  error?: string
  items: FetchedItemSummary[]
}

export interface NewsFetchOutput {
  fetchedCount: number
  totalSources: number
  totalItemsRaw: number
  durationMs: number
  fetchList: FetchSourceDetail[]
}

export async function fetchAllNews(): Promise<NewsFetchOutput> {
  const t0 = Date.now()
  const sources = await prisma.newsSource.findMany({ where: { enabled: true } })

  if (sources.length === 0) {
    return { fetchedCount: 0, totalSources: 0, totalItemsRaw: 0, durationMs: 0, fetchList: [] }
  }

  const results = await Promise.allSettled(sources.map(fetchSingleSource))

  const fetchList: FetchSourceDetail[] = []
  const allItems: { item: RawNewsItem; sourceIdx: number }[] = []

  for (let idx = 0; idx < results.length; idx++) {
    const result = results[idx]
    const source = sources[idx]
    if (result.status === "fulfilled") {
      const items = result.value
      for (const item of items) allItems.push({ item, sourceIdx: idx })
      fetchList.push({
        sourceName: source.name,
        sourceId: source.id,
        sourceType: source.type,
        status: items.length >= 0 ? "success" : "error",
        itemCount: items.length,
        insertedCount: 0,
        durationMs: 0,
        items: items.map((it) => ({
          title: it.title,
          url: it.url,
          publishedAt: it.publishedAt?.toISOString() ?? null,
          category: it.category ?? null,
          isNew: false,
        })),
      })
    } else {
      fetchList.push({
        sourceName: source.name,
        sourceId: source.id,
        sourceType: source.type,
        status: "error",
        itemCount: 0,
        insertedCount: 0,
        durationMs: 0,
        error: result.reason?.message ?? "Unknown error",
        items: [],
      })
    }
  }

  const validItems = allItems.filter(({ item }) => item.title && item.url)
  let totalInserted = 0
  const insertedUrls = new Set<string>()

  for (const { item } of validItems) {
    try {
      const existing = await prisma.newsRawItem.findUnique({ where: { url: item.url } })
      await prisma.newsRawItem.upsert({
        where: { url: item.url },
        update: {},
        create: {
          source: item.source,
          title: item.title,
          url: item.url,
          summary: item.summary,
          publishedAt: item.publishedAt,
          category: item.category,
        },
      })
      if (!existing) {
        insertedUrls.add(item.url)
        totalInserted++
      }
    } catch {
      // duplicate or DB error — skip
    }
  }

  for (const detail of fetchList) {
    let srcInserted = 0
    for (const it of detail.items) {
      if (insertedUrls.has(it.url)) {
        it.isNew = true
        srcInserted++
      }
    }
    detail.insertedCount = srcInserted
  }

  const totalDuration = Date.now() - t0

  return {
    fetchedCount: totalInserted,
    totalSources: sources.length,
    totalItemsRaw: validItems.length,
    durationMs: totalDuration,
    fetchList,
  }
}

export async function testFetchSource(sourceId: string): Promise<{ count: number; error?: string }> {
  const source = await prisma.newsSource.findUnique({ where: { id: sourceId } })
  if (!source) throw new Error("Source not found")
  const items = await fetchSingleSource(source)
  return { count: items.length }
}
