/**
 * Server configuration — env-driven only.
 * NO secrets are hardcoded or committed. See .env.example at the repo root.
 */

const config = {
  port: parseInt(process.env.PORT || "3010", 10),
  appUrl: process.env.APP_URL || "http://localhost:3010",
  rpName: process.env.RP_NAME || "VoidBackups",
  rpID: process.env.RP_ID || "localhost",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Where the SQLite database and backup repos live (relative to repo root). */
  dataDir: process.env.DATA_DIR || "./data",
  /** Session duration in days. */
  sessionDays: parseInt(process.env.SESSION_DAYS || "30", 10),
  /** Agent heartbeat interval in seconds. */
  agentHeartbeatInterval: parseInt(process.env.AGENT_HEARTBEAT_INTERVAL || "30", 10),
  /** Agent offline threshold in seconds (how long since last heartbeat before marked offline). */
  agentOfflineThreshold: parseInt(process.env.AGENT_OFFLINE_THRESHOLD || "90", 10),
} as const

export function isSecure(): boolean {
  return config.appUrl.startsWith("https://")
}

export default config
