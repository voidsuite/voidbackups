/**
 * VoidBackups gateway — serves the built client (client/dist) plus the API:
 *   /api/auth/*       WebAuthn passkey authentication
 *   /api/agents/*     Agent management and coordination
 *   /api/sources/*    Backup source management
 *   /api/jobs/*       Backup job management
 *   /api/runs/*       Backup run history and logs
 *   /api/wizard/*     Setup wizard
 *   /api/notifications/* Notification channel management
 *
 * Data lives in SQLite (DATA_DIR/voidbackups.db) — sign in once with your
 * passkey, manage backups across all your servers.
 */

import { Hono } from "hono"
import { cors } from "hono/cors"
import { fileURLToPath } from "node:url"
import path from "node:path"
import config from "./config.js"
import authRoutes from "./routes/auth.js"
import agentRoutes from "./routes/agents.js"
import sourceRoutes from "./routes/sources.js"
import jobRoutes from "./routes/jobs.js"
import runRoutes from "./routes/runs.js"
import wizardRoutes from "./routes/wizard.js"
import notificationRoutes from "./routes/notifications.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, "../../client/dist")

const app = new Hono()

// --- CORS ---
app.use(
  "*",
  cors({
    origin: config.allowedOrigins.length ? config.allowedOrigins : config.appUrl,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
)

// --- Request logging ---
app.use("*", async (c, next) => {
  await next()
  const res = c.res
  if (res.status >= 400) {
    const body = await res.clone().text().catch(() => "")
    console.log(`[http] ${c.req.method} ${c.req.path} -> ${res.status} ${body.slice(0, 200)}`)
  } else {
    console.log(`[http] ${c.req.method} ${c.req.path} -> ${res.status}`)
  }
})

// --- API routes ---
app.route("/api/auth", authRoutes)
app.route("/api/agents", agentRoutes)
app.route("/api/sources", sourceRoutes)
app.route("/api/jobs", jobRoutes)
app.route("/api/runs", runRoutes)
app.route("/api/wizard", wizardRoutes)
app.route("/api/notifications", notificationRoutes)

// --- Health check ---
app.get("/health", (c) =>
  c.json({ status: "ok", service: "voidbackups", version: "0.1.0" })
)

// --- Static client + SPA fallback ---
const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  txt: "text/plain",
  map: "application/json",
  webmanifest: "application/manifest+json",
}

app.get("*", async (c) => {
  const reqPath = c.req.path
  const filePath = reqPath === "/" ? "/index.html" : reqPath
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  const f = Bun.file(path.join(DIST_DIR, filePath))
  const exists = await f.exists()

  if (exists) {
    return new Response(f, {
      headers: { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" },
    })
  }
  if (!reqPath.startsWith("/api/")) {
    const fallback = Bun.file(path.join(DIST_DIR, "index.html"))
    if (await fallback.exists()) {
      return new Response(fallback, { headers: { "Content-Type": "text/html" } })
    }
  }
  return c.json({ error: "Not found" }, 404)
})

console.log(`[voidbackups] gateway starting on :${config.port} (${config.appUrl})`)

export default {
  port: config.port,
  fetch: app.fetch,
}
