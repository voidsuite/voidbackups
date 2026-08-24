/**
 * Server configuration — env-driven only.
 * NO secrets are hardcoded or committed. See .env.example at the repo root.
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

// Load .env file if it exists (helpful in Docker when env_file isn't picked up)
const envPath = resolve(import.meta.dir, "../../.env")
if (existsSync(envPath)) {
  try {
    const envFile = readFileSync(envPath, "utf-8")
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIndex = trimmed.indexOf("=")
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "")
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // Ignore errors loading .env
  }
}

const config = {
  port: parseInt(process.env.PORT || "3010", 10),
  appUrl: process.env.APP_URL || "http://localhost:3010",
  rpName: process.env.RP_NAME || "VoidBackups",
  rpID: process.env.RP_ID || "localhost",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  dataDir: process.env.DATA_DIR || "./data",
  sessionDays: parseInt(process.env.SESSION_DAYS || "30", 10),
  agentHeartbeatInterval: parseInt(process.env.AGENT_HEARTBEAT_INTERVAL || "30", 10),
  agentOfflineThreshold: parseInt(process.env.AGENT_OFFLINE_THRESHOLD || "90", 10),
} as const

console.log(`[config] APP_URL=${config.appUrl} | RP_ID=${config.rpID} | PORT=${config.port}`)

export function isSecure(): boolean {
  return config.appUrl.startsWith("https://")
}

export default config
