export interface ParsedCurl {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export function parseCurlCommand(cmd: string): ParsedCurl {
  const cleaned = cmd
    .replace(/\\\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned.toLowerCase().startsWith("curl ")) {
    throw new Error("不是有效的 curl 命令")
  }

  const tokens = tokenize(cleaned.slice(5))
  let url = ""
  let method = "GET"
  const headers: Record<string, string> = {}
  let body: string | undefined

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]

    if (t === "-X" || t === "--request") {
      method = tokens[++i]?.toUpperCase() ?? "GET"
    } else if (t === "-H" || t === "--header") {
      const hdr = tokens[++i] ?? ""
      const colonIdx = hdr.indexOf(":")
      if (colonIdx > 0) {
        headers[hdr.slice(0, colonIdx).trim()] = hdr.slice(colonIdx + 1).trim()
      }
    } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary" || t === "--data-urlencode") {
      body = tokens[++i] ?? ""
      if (method === "GET") method = "POST"
    } else if (t === "-u" || t === "--user") {
      const cred = tokens[++i] ?? ""
      headers["Authorization"] = "Basic " + Buffer.from(cred).toString("base64")
    } else if (t === "-b" || t === "--cookie") {
      headers["Cookie"] = tokens[++i] ?? ""
    } else if (t === "-A" || t === "--user-agent") {
      headers["User-Agent"] = tokens[++i] ?? ""
    } else if (t === "-e" || t === "--referer") {
      headers["Referer"] = tokens[++i] ?? ""
    } else if (
      t === "-k" || t === "--insecure" || t === "--compressed" ||
      t === "-s" || t === "--silent" || t === "-S" || t === "--show-error" ||
      t === "-L" || t === "--location" || t === "-v" || t === "--verbose" ||
      t === "-i" || t === "--include"
    ) {
      // flags without value — skip
    } else if (t === "-o" || t === "--output" || t === "--max-time" || t === "--connect-timeout") {
      i++ // skip value
    } else if (!t.startsWith("-") && !url) {
      url = t.replace(/^['"]|['"]$/g, "")
    }
  }

  if (!url) throw new Error("curl 命令中未找到 URL")
  return { url, method, headers, body }
}

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < input.length) {
    while (i < input.length && input[i] === " ") i++
    if (i >= input.length) break

    const quote = input[i]
    if (quote === "'" || quote === '"') {
      i++
      let token = ""
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && quote === '"' && i + 1 < input.length) {
          i++
          token += input[i]
        } else {
          token += input[i]
        }
        i++
      }
      i++ // skip closing quote
      tokens.push(token)
    } else if (input[i] === "$" && i + 1 < input.length && input[i + 1] === "'") {
      i += 2
      let token = ""
      while (i < input.length && input[i] !== "'") {
        if (input[i] === "\\" && i + 1 < input.length) {
          i++
          token += input[i]
        } else {
          token += input[i]
        }
        i++
      }
      i++
      tokens.push(token)
    } else {
      let token = ""
      while (i < input.length && input[i] !== " ") {
        token += input[i]
        i++
      }
      tokens.push(token)
    }
  }
  return tokens
}
