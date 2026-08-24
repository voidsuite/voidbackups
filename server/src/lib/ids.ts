/**
 * ID generation utilities.
 * Random hex strings for IDs, tokens, etc.
 */

import { randomHex, randomBase64url } from "../db/connection.js"

/** Generate a random hex ID (16 bytes = 32 hex chars). */
export function newId(): string {
  return randomHex(16)
}

/** Generate a random token (32 bytes = 64 hex chars). */
export function newToken(): string {
  return randomHex(32)
}

/** Generate a short random ID (8 bytes = 16 hex chars). */
export function shortId(): string {
  return randomHex(8)
}

/** Hash a token with SHA-256 for secure storage. */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = new Uint8Array(hashBuffer)
  return Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Constant-time string comparison to prevent timing attacks. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
