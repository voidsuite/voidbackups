/**
 * SQLite database connection — using bun:sqlite (no external deps).
 * Auto-creates the database file and runs schema migrations on startup.
 */

import { Database } from "bun:sqlite"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import config from "../config.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, "../../..", config.dataDir)

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const DB_PATH = path.join(DATA_DIR, "voidbackups.db")

const db = new Database(DB_PATH)

// Enable WAL mode for better concurrent read performance
db.exec("PRAGMA journal_mode = WAL")
db.exec("PRAGMA foreign_keys = ON")

// Run schema
const schemaPath = path.join(__dirname, "schema.sql")
const schema = fs.readFileSync(schemaPath, "utf-8")
db.exec(schema)

/** Current epoch milliseconds. */
export function now(): number {
  return Date.now()
}

/** Generate a random hex string of the given byte length. */
export function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Generate a random base64url string of the given byte length. */
export function randomBase64url(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export default db
