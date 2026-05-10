import { ROUTE_METADATA } from "../../routes/index.meta.js"
import { QUANT_ROUTE_METADATA } from "../../routes/quant.meta.js"
import { ADMIN_ROUTE_METADATA } from "../../routes/admin.meta.js"

export interface RouteMetadata {
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string
  description: string
  aiExclude?: boolean
}

const ALL_ROUTES: RouteMetadata[] = [
  ...ROUTE_METADATA,
  ...QUANT_ROUTE_METADATA,
  ...ADMIN_ROUTE_METADATA,
].filter((r) => !r.aiExclude)

export function buildApiToolDescription(): string {
  const grouped = new Map<string, RouteMetadata[]>()

  for (const r of ALL_ROUTES) {
    const segments = r.path.split("/")
    const domain = segments.length >= 4 ? segments.slice(0, 4).join("/") : segments.join("/")
    if (!grouped.has(domain)) grouped.set(domain, [])
    grouped.get(domain)!.push(r)
  }

  const lines: string[] = [
    "调用服务端内部 API 获取实时数据或执行操作。可用端点:",
  ]

  for (const [domain, routes] of grouped) {
    lines.push(`\n[${domain}]`)
    for (const r of routes) {
      lines.push(`${r.method} ${r.path} — ${r.description}`)
    }
  }

  return lines.join("\n")
}
