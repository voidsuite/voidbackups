/**
 * Security middleware — adds secure headers, CSRF protection, and input validation.
 */

import type { Context, MiddlewareHandler } from "hono"
import { getCookie } from "hono/cookie"

/**
 * Add security headers to all responses.
 */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()

  // Prevent MIME type sniffing
  c.header("X-Content-Type-Options", "nosniff")

  // Prevent clickjacking
  c.header("X-Frame-Options", "DENY")

  // XSS protection (legacy browsers)
  c.header("X-XSS-Protection", "1; mode=block")

  // Referrer policy
  c.header("Referrer-Policy", "strict-origin-when-cross-origin")

  // Permissions policy — disable unnecessary features
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

  // Content Security Policy
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  )

  // Strict Transport Security (only if HTTPS)
  if (c.req.url.startsWith("https://")) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }
}

/**
 * CSRF protection middleware.
 * Validates that state-changing requests come from the same origin.
 */
export const csrfProtection: MiddlewareHandler = async (c, next) => {
  // Only protect state-changing methods
  const method = c.req.method
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next()
  }

  // Check Origin header
  const origin = c.req.header("Origin")
  const host = c.req.header("Host")

  if (origin && host) {
    const originUrl = new URL(origin)
    if (originUrl.host !== host) {
      return c.json({ error: "CSRF validation failed" }, 403)
    }
  }

  // Check SameSite cookie
  const sessionId = getCookie(c, "voidbackups_sid")
  if (!sessionId && method !== "GET") {
    // No session cookie on a state-changing request — suspicious
    // But don't block agent requests (they use Bearer tokens)
    const authHeader = c.req.header("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      // Could be a CSRF attack, but we'll be lenient for now
      // In production, require CSRF token for form submissions
    }
  }

  return next()
}

/**
 * Input validation helpers.
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  return input
    .slice(0, maxLength)
    .replace(/[<>]/g, "") // Basic XSS prevention
    .trim()
}

export function isValidHexId(id: string): boolean {
  return /^[a-f0-9]{16,64}$/i.test(id)
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Validate request body size.
 */
export function maxBodySize(maxBytes: number): MiddlewareHandler {
  return async (c, next) => {
    const contentLength = parseInt(c.req.header("Content-Length") || "0", 10)
    if (contentLength > maxBytes) {
      return c.json({ error: "Request body too large" }, 413)
    }
    return next()
  }
}
