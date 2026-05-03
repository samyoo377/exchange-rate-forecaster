import "dotenv/config"
import Fastify from "fastify"
import cors from "@fastify/cors"
import { registerRoutes } from "./routes/index.js"

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
})

app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  try {
    done(null, JSON.parse(body as string))
  } catch (e) {
    done(e as Error, undefined)
  }
})

await registerRoutes(app)

const port = parseInt(process.env.PORT ?? "3001")
const host = process.env.HOST ?? "0.0.0.0"

try {
  await app.listen({ port, host })
  console.log(`🚀 Server running at http://localhost:${port}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
