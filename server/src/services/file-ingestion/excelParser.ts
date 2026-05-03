import * as fs from "fs"
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const XLSX = require("xlsx") as typeof import("xlsx")
import { genVersion } from "../../utils/helpers.js"
import type { OhlcBar } from "../../types/index.js"

type RawRow = (string | number | undefined)[]

function excelSerialToDate(serial: number): Date {
  // Excel stores dates as days since 1900-01-01 (with leap-year bug for 1900)
  return new Date((serial - 25569) * 86400 * 1000)
}

function findHeaderRow(rows: RawRow[]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const text = row.map((v) => String(v ?? "").toLowerCase()).join(",")
    if (
      (text.includes("open") || text.includes("开盘")) &&
      (text.includes("close") || text.includes("收盘"))
    ) {
      return i
    }
  }
  return -1
}

function resolveColumnIndex(headers: RawRow, candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => String(h ?? "").toLowerCase().includes(c.toLowerCase()))
    if (idx !== -1) return idx
  }
  return -1
}

export function parseExcelFile(filePath: string, symbol: string): OhlcBar[] {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`)

  const workbook = XLSX.readFile(filePath)
  const bars: OhlcBar[] = []
  const version = genVersion(symbol)

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const allRows = XLSX.utils.sheet_to_json<RawRow>(sheet, { header: 1 })

    const headerIdx = findHeaderRow(allRows)
    if (headerIdx === -1) continue

    const headers = allRows[headerIdx]
    const dateIdx = resolveColumnIndex(headers, ["日期", "date", "time", "datetime"])
    const openIdx = resolveColumnIndex(headers, ["开盘", "open"])
    const highIdx = resolveColumnIndex(headers, ["最高", "high"])
    const lowIdx = resolveColumnIndex(headers, ["最低", "low"])
    const closeIdx = resolveColumnIndex(headers, ["收盘", "close"])

    if (openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) continue

    for (let i = headerIdx + 1; i < allRows.length; i++) {
      const row = allRows[i]
      if (!row || row.length === 0) continue

      const rawDate = dateIdx !== -1 ? row[dateIdx] : row[0]
      const open = Number(row[openIdx])
      const high = Number(row[highIdx])
      const low = Number(row[lowIdx])
      const close = Number(row[closeIdx])

      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue
      if (high < low || open < low || close < low || open > high || close > high) continue

      let tradeDate: Date
      if (typeof rawDate === "number") {
        tradeDate = excelSerialToDate(rawDate)
      } else if (rawDate != null) {
        tradeDate = new Date(String(rawDate))
      } else {
        continue
      }

      if (isNaN(tradeDate.getTime())) continue

      bars.push({ symbol, tradeDate, open, high, low, close, source: "excel", version })
    }

    // deduplicate by tradeDate — keep first occurrence per bar
    if (bars.length > 0) break
  }

  return bars
}
