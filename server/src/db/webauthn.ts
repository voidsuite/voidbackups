/**
 * WebAuthn credential and challenge storage.
 * Single-user: exactly one credential is registered.
 */

import db, { now, randomHex } from "./connection.js"

// --- Users ---

export interface StoredUser {
  id: string
  credential_id: string
  public_key: string
  counter: number
  name: string
  created_at: number
  last_login: number | null
}

const insertUser = db.query(`
  INSERT INTO users (id, credential_id, public_key, counter, name, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const selectUserById = db.query("SELECT * FROM users WHERE id = ?")
const selectUserByCredentialId = db.query("SELECT * FROM users WHERE credential_id = ?")
const selectUserCount = db.query("SELECT COUNT(*) as count FROM users")
const updateLastLogin = db.query("UPDATE users SET last_login = ? WHERE id = ?")
const updateCredential = db.query("UPDATE users SET public_key = ?, counter = ? WHERE id = ?")

export function hasUser(): boolean {
  const row = selectUserCount.get() as { count: number }
  return row.count > 0
}

export function createUser(data: {
  id: string
  credentialId: string
  publicKey: string
  counter: number
  name: string
}): StoredUser {
  const ts = now()
  insertUser.run(data.id, data.credentialId, data.publicKey, data.counter, data.name, ts)
  return selectUserById.get(data.id) as StoredUser
}

export function getUserById(id: string): StoredUser | null {
  return (selectUserById.get(id) as StoredUser) ?? null
}

export function getUserByCredentialId(credentialId: string): StoredUser | null {
  return (selectUserByCredentialId.get(credentialId) as StoredUser) ?? null
}

export function touchUser(id: string): void {
  updateLastLogin.run(now(), id)
}

export function updateCredentialCounter(id: string, counter: number): void {
  updateCredential.run(undefined, counter, id) // publicKey unchanged
}

// --- Challenges ---

export interface StoredChallenge {
  challenge: string
  user_id: string | null
  type: string
  expires_at: number
  created_at: number
}

const insertChallenge = db.query(`
  INSERT INTO webauthn_challenges (challenge, user_id, type, expires_at, created_at)
  VALUES (?, ?, ?, ?, ?)
`)

const selectChallenge = db.query("SELECT * FROM webauthn_challenges WHERE challenge = ?")
const deleteChallenge = db.query("DELETE FROM webauthn_challenges WHERE challenge = ?")
const deleteExpiredChallenges = db.query("DELETE FROM webauthn_challenges WHERE expires_at < ?")

export function storeChallenge(
  challenge: string,
  type: "registration" | "authentication",
  userId: string | null = null,
  ttlMs = 120_000 // 2 minutes
): void {
  const ts = now()
  insertChallenge.run(challenge, userId, type, ts + ttlMs, ts)
}

export function takeChallenge(challenge: string): StoredChallenge | null {
  const row = selectChallenge.get(challenge) as StoredChallenge | null
  if (!row) return null
  deleteChallenge.run(challenge) // consumed once
  if (now() > row.expires_at) return null // expired
  return row
}

// Sweep expired challenges periodically
setInterval(() => {
  deleteExpiredChallenges.run(now())
}, 5 * 60 * 1000).unref?.()

// --- Sessions ---

export interface SessionData {
  id: string
  userId: string
  expiresAt: number
  createdAt: number
}

const insertSession = db.query(`
  INSERT INTO sessions (id, user_id, expires_at, created_at)
  VALUES (?, ?, ?, ?)
`)

const selectSession = db.query("SELECT * FROM sessions WHERE id = ?")
const deleteSession = db.query("DELETE FROM sessions WHERE id = ?")
const deleteExpiredSessions = db.query("DELETE FROM sessions WHERE expires_at < ?")
const deleteSessionsForUser = db.query("DELETE FROM sessions WHERE user_id = ?")

export function createSession(userId: string, durationDays: number): string {
  const id = randomHex(32)
  const ts = now()
  insertSession.run(id, userId, ts + durationDays * 24 * 60 * 60 * 1000, ts)
  return id
}

export function getSession(id: string): SessionData | null {
  if (!id) return null
  const row = selectSession.get(id) as SessionData | null
  if (!row) return null
  if (now() > row.expires_at) {
    deleteSession.run(id)
    return null
  }
  return row
}

export function deleteSessionById(id: string): void {
  deleteSession.run(id)
}

export function deleteAllSessionsForUser(userId: string): void {
  deleteSessionsForUser.run(userId)
}

export function getSessionCookieName(): string {
  return "voidbackups_sid"
}

export function getSessionCookieOptions(maxAgeDays?: number): Record<string, string | boolean | number> {
  const opts: Record<string, string | boolean | number> = {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: config.appUrl.startsWith("https://"),
  }
  if (maxAgeDays !== undefined) {
    opts.maxAge = maxAgeDays * 24 * 60 * 60
  }
  return opts
}

// Sweep expired sessions periodically
setInterval(() => {
  deleteExpiredSessions.run(now())
}, 10 * 60 * 1000).unref?.()

// --- Audit Log ---

const insertAuditLog = db.query(`
  INSERT INTO audit_log (id, action, details, ip_address, created_at)
  VALUES (?, ?, ?, ?, ?)
`)

export function auditLog(action: string, details: Record<string, unknown> = {}, ip?: string): void {
  insertAuditLog.run(randomHex(16), action, JSON.stringify(details), ip ?? null, now())
}

// --- System Config ---

const upsertConfig = db.query(`
  INSERT INTO system_config (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`)

const selectConfig = db.query("SELECT value FROM system_config WHERE key = ?")

export function setConfig(key: string, value: string): void {
  upsertConfig.run(key, value, now())
}

export function getConfig(key: string): string | null {
  const row = selectConfig.get(key) as { value: string } | null
  return row?.value ?? null
}

export function getAllConfig(): Record<string, string> {
  const rows = db.query("SELECT key, value FROM system_config").all() as Array<{ key: string; value: string }>
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}
