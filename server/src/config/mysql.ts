export const mysqlConfig = {
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: parseInt(process.env.MYSQL_PORT ?? "3306"),
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE ?? "exchange_rate_forecaster",
}

export function buildDatabaseUrl(config = mysqlConfig): string {
  const { user, password, host, port, database } = config
  const auth = password ? `${user}:${password}` : user
  return `mysql://${auth}@${host}:${port}/${database}`
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = buildDatabaseUrl()
}
