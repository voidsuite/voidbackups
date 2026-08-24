/**
 * /api/wizard/* — Setup wizard endpoints.
 * First-time setup flow: check status, configure storage, get install script.
 */

import { Hono } from "hono"
import { authRequired } from "../middleware/auth.js"
import { hasUser, setConfig, getConfig, getAllConfig } from "../db/webauthn.js"
import { randomHex } from "../db/connection.js"
import { newToken } from "../lib/ids.js"
import db from "../db/connection.js"

const wizard = new Hono()

// GET /api/wizard/status — check if setup is complete
wizard.get("/status", async (c) => {
  const isSetup = hasUser()
  const config = getAllConfig()

  return c.json({
    isSetup,
    steps: {
      account: isSetup,
      storage: !!config.storage_path,
      encryption: !!config.encryption_key_id,
      agent: (db.query("SELECT COUNT(*) as count FROM agents").get() as any).count > 0,
    },
  })
})

// POST /api/wizard/storage — configure storage location
wizard.post("/storage", authRequired, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.path) {
    return c.json({ error: "Missing storage path" }, 400)
  }

  setConfig("storage_path", body.path)
  setConfig("storage_type", body.type || "local")

  // Optional S3/R2/B2 config
  if (body.s3Endpoint) setConfig("s3_endpoint", body.s3Endpoint)
  if (body.s3Bucket) setConfig("s3_bucket", body.s3Bucket)
  if (body.s3AccessKey) setConfig("s3_access_key", body.s3AccessKey)
  if (body.s3SecretKey) setConfig("s3_secret_key", body.s3SecretKey)
  if (body.s3Region) setConfig("s3_region", body.s3Region)

  return c.json({ ok: true })
})

// POST /api/wizard/encryption — generate encryption key
wizard.post("/encryption", authRequired, async (c) => {
  // Generate a new restic repository password
  const repoPassword = randomHex(32)

  // Store the key (in production, this would be wrapped with a passkey-derived key)
  const keyId = randomHex(8)
  db.query(`
    INSERT INTO encryption_keys (id, name, wrapped_key, created_at)
    VALUES (?, ?, ?, ?)
  `).run(keyId, "default", repoPassword, Date.now())

  setConfig("encryption_key_id", keyId)

  return c.json({
    keyId,
    // In production, this would only be shown once and not stored in plaintext
    password: repoPassword,
  })
})

// GET /api/wizard/agents — list agents for the wizard
wizard.get("/agents", authRequired, async (c) => {
  const agents = db.query("SELECT id, name, hostname, status, last_seen FROM agents ORDER BY registered_at").all()
  return c.json(agents)
})

// POST /api/wizard/complete — mark setup as complete
wizard.post("/complete", authRequired, async (c) => {
  setConfig("setup_complete", "true")
  return c.json({ ok: true })
})

export default wizard
