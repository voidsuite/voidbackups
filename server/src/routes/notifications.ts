/**
 * /api/notifications/* — Notification channel management.
 * Configure Telegram, webhooks, and email notifications.
 */

import { Hono } from "hono"
import { authRequired } from "../middleware/auth.js"
import { newId } from "../lib/ids.js"
import { now } from "../db/connection.js"
import { auditLog } from "../db/webauthn.js"
import db from "../db/connection.js"

const notifications = new Hono()

// --- DB helpers ---

interface NotificationChannel {
  id: string
  type: string
  name: string
  config: string
  events: string
  enabled: number
  created_at: number
}

const insertChannel = db.query(`
  INSERT INTO notification_channels (id, type, name, config, events, enabled, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const selectAllChannels = db.query("SELECT * FROM notification_channels ORDER BY created_at DESC")
const selectChannelById = db.query("SELECT * FROM notification_channels WHERE id = ?")
const updateChannel = db.query(`
  UPDATE notification_channels SET name = ?, config = ?, events = ?, enabled = ? WHERE id = ?
`)
const deleteChannel = db.query("DELETE FROM notification_channels WHERE id = ?")

// GET /api/notifications — list all notification channels
notifications.get("/", authRequired, async (c) => {
  const channels = selectAllChannels.all() as NotificationChannel[]
  return c.json(
    channels.map((ch) => ({
      ...ch,
      config: sanitizeConfig(JSON.parse(ch.config)),
      events: JSON.parse(ch.events),
    }))
  )
})

// POST /api/notifications — create a notification channel
notifications.post("/", authRequired, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.type || !body?.name || !body?.config) {
    return c.json({ error: "Missing type, name, or config" }, 400)
  }

  const validTypes = ["telegram", "webhook", "email"]
  if (!validTypes.includes(body.type)) {
    return c.json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` }, 400)
  }

  const id = newId()
  insertChannel.run(
    id,
    body.type,
    body.name,
    JSON.stringify(body.config),
    JSON.stringify(body.events || ["backup_failed", "backup_completed"]),
    body.enabled !== false ? 1 : 0,
    now()
  )

  auditLog("notification_channel_created", { channelId: id, type: body.type, name: body.name })
  return c.json({ id })
})

// PATCH /api/notifications/:id — update a channel
notifications.patch("/:id", authRequired, async (c) => {
  const id = c.req.param("id")
  const channel = selectChannelById.get(id) as NotificationChannel | null
  if (!channel) {
    return c.json({ error: "Channel not found" }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  updateChannel.run(
    body.name ?? channel.name,
    body.config ? JSON.stringify(body.config) : channel.config,
    body.events ? JSON.stringify(body.events) : channel.events,
    body.enabled !== undefined ? (body.enabled ? 1 : 0) : channel.enabled,
    id
  )

  return c.json({ ok: true })
})

// DELETE /api/notifications/:id — delete a channel
notifications.delete("/:id", authRequired, async (c) => {
  const id = c.req.param("id")
  const channel = selectChannelById.get(id) as NotificationChannel | null
  if (!channel) {
    return c.json({ error: "Channel not found" }, 404)
  }

  deleteChannel.run(id)
  auditLog("notification_channel_deleted", { channelId: id, name: channel.name })
  return c.json({ ok: true })
})

// POST /api/notifications/:id/test — test a notification channel
notifications.post("/:id/test", authRequired, async (c) => {
  const id = c.req.param("id")
  const channel = selectChannelById.get(id) as NotificationChannel | null
  if (!channel) {
    return c.json({ error: "Channel not found" }, 404)
  }

  const config = JSON.parse(channel.config)

  try {
    switch (channel.type) {
      case "webhook": {
        const res = await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "🧪 VoidBackups test notification",
            event: "test",
            timestamp: Date.now(),
          }),
        })
        if (!res.ok) throw new Error(`Webhook returned ${res.status}`)
        break
      }
      case "telegram": {
        const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: config.chatId,
            text: "🧪 VoidBackups test notification",
            parse_mode: "HTML",
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.description || `Telegram API error ${res.status}`)
        }
        break
      }
      case "email": {
        // Email test would require SMTP setup — placeholder
        throw new Error("Email test not yet implemented")
      }
    }

    return c.json({ ok: true, message: "Test notification sent successfully" })
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 400)
  }
})

/** Remove sensitive fields from config before sending to client. */
function sanitizeConfig(config: Record<string, any>): Record<string, any> {
  const safe = { ...config }
  // Mask tokens and secrets
  if (safe.botToken) safe.botToken = "***" + safe.botToken.slice(-4)
  if (safe.apiKey) safe.apiKey = "***" + safe.apiKey.slice(-4)
  if (safe.password) safe.password = "***"
  return safe
}

export default notifications
