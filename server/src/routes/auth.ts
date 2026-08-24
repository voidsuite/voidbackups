/**
 * /api/auth/* — WebAuthn passkey authentication.
 * Single-user: first visit sets up the account, subsequent visits use passkey login.
 */

import { Hono } from "hono"
import { setCookie, deleteCookie, getCookie } from "hono/cookie"
import {
  hasUser,
  createSession,
  deleteSessionById,
  getSessionCookieName,
  getSessionCookieOptions,
  getSession,
  getUserById,
  auditLog,
} from "../db/webauthn.js"
import {
  startRegistration,
  completeRegistration,
  startAuthentication,
  completeAuthentication,
} from "../lib/webauthn.js"

// Import config at top level and keep a local reference
import serverConfig from "../config.js"

const SESSION_DAYS = serverConfig.sessionDays

const auth = new Hono()

// GET /api/auth/status — is setup complete?
auth.get("/status", async (c) => {
  const isSetup = hasUser()
  return c.json({ isSetup })
})

// POST /api/auth/register/start — begin passkey registration (setup wizard)
auth.post("/register/start", async (c) => {
  if (hasUser()) {
    return c.json({ error: "Account already exists" }, 400)
  }

  const body = await c.req.json().catch(() => null)
  const userName = body?.name as string | undefined
  if (!userName || userName.trim().length === 0) {
    return c.json({ error: "Name is required" }, 400)
  }

  try {
    const options = await startRegistration(userName.trim())
    return c.json(options)
  } catch (err) {
    console.error("[auth] register/start error:", err)
    return c.json({ error: (err as Error).message }, 400)
  }
})

// POST /api/auth/register/complete — finish passkey registration
auth.post("/register/complete", async (c) => {
  if (hasUser()) {
    return c.json({ error: "Account already exists" }, 400)
  }

  const body = await c.req.json().catch(() => null)
  if (!body?.response || !body?.challenge || !body?.name) {
    return c.json({ error: "Missing response, challenge, or name" }, 400)
  }

  try {
    const user = await completeRegistration(body.response, body.challenge, body.name)

    // Create a session cookie
    const sessionId = createSession(user.id, SESSION_DAYS)
    setCookie(c, getSessionCookieName(), sessionId, getSessionCookieOptions(SESSION_DAYS))

    auditLog("user_registered", { userId: user.id, name: user.name })

    return c.json({ user: { id: user.id, name: user.name } })
  } catch (err) {
    console.error("[auth] register/complete error:", err)
    return c.json({ error: (err as Error).message }, 400)
  }
})

// POST /api/auth/login/start — begin passkey authentication
auth.post("/login/start", async (c) => {
  if (!hasUser()) {
    return c.json({ error: "No account configured" }, 400)
  }

  try {
    const options = await startAuthentication()
    return c.json(options)
  } catch (err) {
    console.error("[auth] login/start error:", err)
    return c.json({ error: (err as Error).message }, 400)
  }
})

// POST /api/auth/login/complete — finish passkey authentication
auth.post("/login/complete", async (c) => {
  if (!hasUser()) {
    return c.json({ error: "No account configured" }, 400)
  }

  const body = await c.req.json().catch(() => null)
  if (!body?.response || !body?.challenge) {
    return c.json({ error: "Missing response or challenge" }, 400)
  }

  console.log("[auth] login/complete — origin:", c.req.header("origin"), "| config.appUrl:", serverConfig.appUrl)

  try {
    const user = await completeAuthentication(body.response, body.challenge)

    // Create a session cookie
    const sessionId = createSession(user.id, SESSION_DAYS)
    setCookie(c, getSessionCookieName(), sessionId, getSessionCookieOptions(SESSION_DAYS))

    auditLog("user_login", { userId: user.id })

    return c.json({ user: { id: user.id, name: user.name } })
  } catch (err) {
    console.error("[auth] login/complete error:", (err as Error).message)
    return c.json({ error: (err as Error).message }, 400)
  }
})

// GET /api/auth/me — current user
auth.get("/me", async (c) => {
  const sessionId = getCookie(c, getSessionCookieName())
  if (!sessionId) {
    return c.json({ error: "Not authenticated" }, 401)
  }

  const session = getSession(sessionId)
  if (!session) {
    deleteCookie(c, getSessionCookieName())
    return c.json({ error: "Session expired" }, 401)
  }

  const user = getUserById(session.userId)
  if (!user) {
    deleteCookie(c, getSessionCookieName())
    return c.json({ error: "User not found" }, 401)
  }

  return c.json({ user: { id: user.id, name: user.name } })
})

// POST /api/auth/logout — destroy session
auth.post("/logout", async (c) => {
  const sessionId = getCookie(c, getSessionCookieName())
  if (sessionId) {
    deleteSessionById(sessionId)
    deleteCookie(c, getSessionCookieName(), getSessionCookieOptions())
  }
  return c.json({ ok: true })
})

export default auth
