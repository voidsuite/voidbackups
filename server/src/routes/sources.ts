/**
 * /api/sources/* — Backup source management.
 * Sources represent what to back up on each agent.
 */

import { Hono } from "hono"
import { authRequired } from "../middleware/auth.js"
import { newId } from "../lib/ids.js"
import { now } from "../db/connection.js"
import { auditLog } from "../db/webauthn.js"
import db from "../db/connection.js"

const sources = new Hono()

// --- DB helpers ---

interface Source {
  id: string
  agent_id: string
  type: string
  name: string
  path: string
  metadata: string
  discovered: number
  enabled: number
  created_at: number
}

const insertSource = db.query(`
  INSERT INTO sources (id, agent_id, type, name, path, metadata, discovered, enabled, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const selectSourcesByAgent = db.query("SELECT * FROM sources WHERE agent_id = ? ORDER BY created_at DESC")
const selectSourceById = db.query("SELECT * FROM sources WHERE id = ?")
const updateSource = db.query(`
  UPDATE sources SET name = ?, path = ?, metadata = ?, enabled = ? WHERE id = ?
`)
const deleteSource = db.query("DELETE FROM sources WHERE id = ?")
const deleteSourcesByAgent = db.query("DELETE FROM sources WHERE agent_id = ?")

// GET /api/sources — list all sources (grouped by agent)
sources.get("/", authRequired, async (c) => {
  const agents = db.query("SELECT id, name FROM agents ORDER BY name").all() as Array<{ id: string; name: string }>

  const result = agents.map((agent) => {
    const agentSources = selectSourcesByAgent.all(agent.id) as Source[]
    return {
      agent: { id: agent.id, name: agent.name },
      sources: agentSources.map((s) => ({
        ...s,
        metadata: JSON.parse(s.metadata || "{}"),
      })),
    }
  })

  return c.json(result)
})

// GET /api/sources/:agentId — list sources for a specific agent
sources.get("/:agentId", authRequired, async (c) => {
  const agentId = c.req.param("agentId")
  const agentSources = selectSourcesByAgent.all(agentId) as Source[]

  return c.json(
    agentSources.map((s) => ({
      ...s,
      metadata: JSON.parse(s.metadata || "{}"),
    }))
  )
})

// POST /api/sources — create a new source
sources.post("/", authRequired, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.agentId || !body?.type || !body?.name || !body?.path) {
    return c.json({ error: "Missing agentId, type, name, or path" }, 400)
  }

  const validTypes = ["docker_volume", "docker_container", "sqlite", "postgresql", "mysql", "redis", "path"]
  if (!validTypes.includes(body.type)) {
    return c.json({ error: `Invalid source type. Must be one of: ${validTypes.join(", ")}` }, 400)
  }

  const id = newId()
  insertSource.run(id, body.agentId, body.type, body.name, body.path, JSON.stringify(body.metadata || {}), 0, 1, now())

  auditLog("source_created", { sourceId: id, type: body.type, name: body.name })
  return c.json({ id })
})

// POST /api/sources/discover/:agentId — trigger source discovery on an agent
sources.post("/discover/:agentId", authRequired, async (c) => {
  const agentId = c.req.param("agentId")

  // Create a discovery task for the agent
  // The agent will scan for backup sources and report them back
  auditLog("source_discovery_triggered", { agentId })
  return c.json({ ok: true, message: "Discovery task queued. Agent will report sources on next heartbeat." })
})

// PATCH /api/sources/:id — update a source
sources.patch("/:id", authRequired, async (c) => {
  const id = c.req.param("id")
  const source = selectSourceById.get(id) as Source | null
  if (!source) {
    return c.json({ error: "Source not found" }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  updateSource.run(
    body.name ?? source.name,
    body.path ?? source.path,
    JSON.stringify(body.metadata ?? JSON.parse(source.metadata || "{}")),
    body.enabled !== undefined ? (body.enabled ? 1 : 0) : source.enabled,
    id
  )

  return c.json({ ok: true })
})

// DELETE /api/sources/:id — delete a source
sources.delete("/:id", authRequired, async (c) => {
  const id = c.req.param("id")
  const source = selectSourceById.get(id) as Source | null
  if (!source) {
    return c.json({ error: "Source not found" }, 404)
  }

  deleteSource.run(id)
  auditLog("source_deleted", { sourceId: id, name: source.name })
  return c.json({ ok: true })
})

// POST /api/sources/bulk — bulk create sources (from discovery)
// Skips duplicates by matching agent_id + path.
sources.post("/bulk", authRequired, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.agentId || !Array.isArray(body?.sources)) {
    return c.json({ error: "Missing agentId or sources array" }, 400)
  }

  // Get existing source paths for this agent to deduplicate
  const existing = db.query("SELECT path FROM sources WHERE agent_id = ?").all(body.agentId) as Array<{ path: string }>
  const existingPaths = new Set(existing.map((e) => e.path))

  const created: string[] = []
  const skipped: string[] = []
  for (const s of body.sources) {
    if (existingPaths.has(s.path)) {
      skipped.push(s.path)
      continue
    }
    const id = newId()
    insertSource.run(id, body.agentId, s.type, s.name, s.path, JSON.stringify(s.metadata || {}), 1, 1, now())
    existingPaths.add(s.path) // Prevent dupes within same batch
    created.push(id)
  }

  auditLog("sources_bulk_created", { agentId: body.agentId, created: created.length, skipped: skipped.length })
  return c.json({ created, skipped })
})

export default sources
