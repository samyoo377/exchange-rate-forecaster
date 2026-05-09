import "dotenv/config"
import "./config/mysql.js"
import Fastify from "fastify"
import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import fastifyStatic from "@fastify/static"
import { registerRoutes } from "./routes/index.js"
import { registerAdminRoutes } from "./routes/admin.js"
import { startNewsCronJobs } from "./services/news/index.js"
import { startPredictionCronJob } from "./services/prediction/predictionCron.js"
import { migrateIndicatorCategories } from "./services/migrateIndicatorCategories.js"
import { getUploadsDir } from "./services/file/fileService.js"

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
})

await app.register(multipart, {
  limits: { fileSize: 20 * 1024 * 1024 },
})

await app.register(fastifyStatic, {
  root: getUploadsDir(),
  prefix: "/uploads/",
  decorateReply: false,
})

app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  try {
    done(null, JSON.parse(body as string))
  } catch (e) {
    done(e as Error, undefined)
  }
})

await registerRoutes(app)
await registerAdminRoutes(app)

const port = parseInt(process.env.PORT ?? "4001")
const host = process.env.HOST ?? "0.0.0.0"

try {
  await app.listen({ port, host })
  console.log(`🚀 Server running at http://localhost:${port}`)
  await migrateIndicatorCategories()
  startNewsCronJobs()
  startPredictionCronJob()
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
