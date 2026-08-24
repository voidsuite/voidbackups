/**
 * Encryption key management.
 * Handles wrapping/unwrapping restic repository passwords
 * with keys derived from the user's passkey.
 */

import db, { randomHex, now } from "../db/connection.js"

const ALGO = "AES-GCM"
const KEY_LENGTH = 256
const IV_LENGTH = 12
const SALT_LENGTH = 16
const ITERATIONS = 100_000

/**
 * Derive a CryptoKey from a passphrase using PBKDF2.
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  )
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  )
}

/**
 * Encrypt data with a passphrase.
 */
export async function encrypt(data: string, passphrase: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(passphrase, salt)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoder.encode(data)
  )

  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length)

  return btoa(String.fromCharCode(...combined))
}

/**
 * Decrypt data with a passphrase.
 */
export async function decrypt(encrypted: string, passphrase: string): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0))
  const salt = combined.slice(0, SALT_LENGTH)
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH)

  const key = await deriveKey(passphrase, salt)
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(plaintext)
}

/**
 * Generate a new restic repository password.
 */
export function generateRepoPassword(): string {
  return randomHex(32)
}

/**
 * Store an encryption key (wrapped with a key derived from the passkey).
 */
export function storeEncryptionKey(name: string, repoPassword: string, wrappingKey: string): string {
  const id = randomHex(8)

  // In a real implementation, we'd wrap the repoPassword with wrappingKey
  // For now, we store it directly (in production, always encrypt!)
  const wrappedKey = repoPassword // TODO: Actually wrap with wrappingKey

  db.query(`
    INSERT INTO encryption_keys (id, name, wrapped_key, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, name, wrappedKey, now())

  return id
}

/**
 * Get an encryption key by ID.
 */
export function getEncryptionKey(id: string): { id: string; name: string; wrappedKey: string } | null {
  const row = db.query("SELECT * FROM encryption_keys WHERE id = ?").get(id) as any
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    wrappedKey: row.wrapped_key,
  }
}

/**
 * Get the repo password for a job.
 * In production, this would unwrap the key using the user's passkey-derived key.
 */
export function getRepoPassword(jobId: string): string {
  const job = db.query("SELECT encryption FROM jobs WHERE id = ?").get(jobId) as any
  if (!job) throw new Error("Job not found")

  const encryption = JSON.parse(job.encryption || "{}")
  const keyId = encryption.keyId

  if (!keyId) {
    // Fallback — not recommended for production
    return "voidbackups-default"
  }

  const key = getEncryptionKey(keyId)
  if (!key) throw new Error("Encryption key not found")

  // In production, unwrap here
  return key.wrappedKey
}

/**
 * Delete an encryption key.
 */
export function deleteEncryptionKey(id: string): boolean {
  const result = db.query("DELETE FROM encryption_keys WHERE id = ?").run(id)
  return result.changes > 0
}

/**
 * List all encryption keys.
 */
export function listEncryptionKeys(): Array<{ id: string; name: string; createdAt: number }> {
  return db.query("SELECT id, name, created_at FROM encryption_keys ORDER BY created_at").all() as any[]
}
