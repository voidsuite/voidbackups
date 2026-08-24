/**
 * Auth middleware — validates the httpOnly session cookie on every API request.
 * Fails with 401 when no valid session is present.
 */

import { getCookie, setCookie } from "hono/cookie"
import type { Context, MiddlewareHandler } from "hono"
import {
  getSession,
  deleteSessionById,
  getSessionCookieName,
  getSessionCookieOptions,
  type SessionData,
} from "../db/webauthn.js"

export interface AuthPrincipal {
  userId: string
  sessionId: string
}

export function getAuthUser(c: Context): AuthPrincipal | null {
  return c.get("auth") ?? null
}

export const authRequired: MiddlewareHandler = async (c, next) => {
  const cookieName = getSessionCookieName()
  const sessionId = getCookie(c, cookieName)

  if (!sessionId) {
    return c.json({ error: "Not authenticated" }, 401)
  }

  const session = getSession(sessionId)
  if (!session) {
    // Expired or invalid session — clear the cookie
    setCookie(c, cookieName, "", { ...getSessionCookieOptions(), maxAge: 0 })
    return c.json({ error: "Session expired" }, 401)
  }

  c.set("auth", {
    userId: session.userId,
    sessionId: session.id,
  })

  await next()
}

/** Optional auth — sets auth principal if available, but doesn't fail. */
export const authOptional: MiddlewareHandler = async (c, next) => {
  const cookieName = getSessionCookieName()
  const sessionId = getCookie(c, cookieName)

  if (sessionId) {
    const session = getSession(sessionId)
    if (session) {
      c.set("auth", {
        userId: session.userId,
        sessionId: session.id,
      })
    }
  }

  await next()
}
