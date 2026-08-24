/**
 * Rate limiting middleware — in-memory sliding window.
 * Limits API requests per IP to prevent abuse.
 */

import type { Context, MiddlewareHandler } from "hono"

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key)
    }
  }
}, 60_000).unref?.()

interface RateLimitOptions {
  windowMs: number
  max: number
  message?: string
}

/**
 * Create a rate limiter middleware.
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { windowMs, max, message = "Too many requests" } = options

  return async (c: Context, next) => {
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown"
    const key = `${ip}:${c.req.path}`
    const now = Date.now()

    const entry = store.get(key)

    if (!entry || now > entry.resetAt) {
      // New window
      store.set(key, { count: 1, resetAt: now + windowMs })
      c.header("X-RateLimit-Limit", String(max))
      c.header("X-RateLimit-Remaining", String(max - 1))
      return next()
    }

    if (entry.count >= max) {
      c.header("X-RateLimit-Limit", String(max))
      c.header("X-RateLimit-Remaining", "0")
      c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)))
      return c.json({ error: message }, 429)
    }

    entry.count++
    c.header("X-RateLimit-Limit", String(max))
    c.header("X-RateLimit-Remaining", String(max - entry.count))
    return next()
  }
}

/** Strict rate limit for auth endpoints (5 attempts per 15 minutes). */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many authentication attempts. Try again later.",
})

/** General API rate limit (100 requests per minute). */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: "Rate limit exceeded. Slow down.",
})

/** Agent API rate limit (30 requests per minute). */
export const agentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: "Agent rate limit exceeded.",
})
