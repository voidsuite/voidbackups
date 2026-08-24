/**
 * /api/jobs/* — Backup job management.
 * Jobs define what to back up, when, how, and with what retention.
 */

import { Hono } from "hono"
import { authRequired } from "../middleware/auth.js"
import { newId } from "../lib/ids.js"
import { now } from "../db/connection.js"
import { auditLog } from "../db/webauthn.js"
import db from "../db/connection.js"

const jobs = new Hono()

// --- DB helpers ---

interface Job {
  id: string
  name: string
  agent_id: string
  schedule: string
  sources: string
  retention: string
  storage: string
  encryption: string
  conditions: string
  enabled: number
  last_run: number | null
  next_run: number | null
  created_at: number
  updated_at: number
}

const insertJob = db.query(`
  INSERT INTO jobs (id, name, agent_id, schedule, sources, retention, storage, encryption, conditions, enabled, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const selectAllJobs = db.query(`
  SELECT j.*, a.name as agent_name
  FROM jobs j
  LEFT JOIN agents a ON a.id = j.agent_id
  ORDER BY j.created_at DESC
`)

const selectJobById = db.query(`
  SELECT j.*, a.name as agent_name
  FROM jobs j
  LEFT JOIN agents a ON a.id = j.agent_id
  WHERE j.id = ?
`)

const updateJob = db.query(`
  UPDATE jobs SET name = ?, schedule = ?, sources = ?, retention = ?, storage = ?, encryption = ?, conditions = ?, enabled = ?, updated_at = ?
  WHERE id = ?
`)

const deleteJob = db.query("DELETE FROM jobs WHERE id = ?")

function parseJob(row: Job & { agent_name?: string }) {
  return {
    ...row,
    schedule: JSON.parse(row.schedule),
    sources: JSON.parse(row.sources),
    retention: JSON.parse(row.retention),
    storage: JSON.parse(row.storage),
    encryption: JSON.parse(row.encryption),
    conditions: JSON.parse(row.conditions || "[]"),
    agent_name: row.agent_name,
  }
}

// GET /api/jobs — list all jobs
jobs.get("/", authRequired, async (c) => {
  const allJobs = selectAllJobs.all() as Array<Job & { agent_name?: string }>
  return c.json(allJobs.map(parseJob))
})

// GET /api/jobs/:id — get a specific job with details
jobs.get("/:id", authRequired, async (c) => {
  const id = c.req.param("id")
  const job = selectJobById.get(id) as (Job & { agent_name?: string }) | null
  if (!job) {
    return c.json({ error: "Job not found" }, 404)
  }

  // Get recent runs
  const runs = db.query(`
    SELECT * FROM runs WHERE job_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(id)

  // Get sources detail
  const sourceIds = JSON.parse(job.sources) as string[]
  const sources = sourceIds.length > 0
    ? db.query(`SELECT * FROM sources WHERE id IN (${sourceIds.map(() => "?").join(",")})`).all(...sourceIds)
    : []

  return c.json({
    ...parseJob(job),
    sources_detail: sources,
    recent_runs: runs,
  })
})

// POST /api/jobs — create a new backup job
jobs.post("/", authRequired, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.name || !body?.agentId) {
    return c.json({ error: "Missing name or agentId" }, 400)
  }

  const id = newId()
  const ts = now()

  const schedule = JSON.stringify(body.schedule || { type: "manual" })
  const sources = JSON.stringify(body.sources || [])
  const retention = JSON.stringify(body.retention || {
    keepDaily: 7,
    keepWeekly: 4,
    keepMonthly: 6,
    keepYearly: 2,
  })
  const storage = JSON.stringify(body.storage || { type: "local", path: "/var/backups/voidbackups" })
  const encryption = JSON.stringify(body.encryption || { enabled: true })
  const conditions = JSON.stringify(body.conditions || [])

  insertJob.run(id, body.name, body.agentId, schedule, sources, retention, storage, encryption, conditions, 1, ts, ts)

  auditLog("job_created", { jobId: id, name: body.name, agentId: body.agentId })
  return c.json({ id })
})

// PATCH /api/jobs/:id — update a job
jobs.patch("/:id", authRequired, async (c) => {
  const id = c.req.param("id")
  const job = selectJobById.get(id) as Job | null
  if (!job) {
    return c.json({ error: "Job not found" }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const ts = now()

  updateJob.run(
    body.name ?? job.name,
    body.schedule ? JSON.stringify(body.schedule) : job.schedule,
    body.sources ? JSON.stringify(body.sources) : job.sources,
    body.retention ? JSON.stringify(body.retention) : job.retention,
    body.storage ? JSON.stringify(body.storage) : job.storage,
    body.encryption ? JSON.stringify(body.encryption) : job.encryption,
    body.conditions ? JSON.stringify(body.conditions) : job.conditions,
    body.enabled !== undefined ? (body.enabled ? 1 : 0) : job.enabled,
    ts,
    id
  )

  return c.json({ ok: true })
})

// DELETE /api/jobs/:id — delete a job
jobs.delete("/:id", authRequired, async (c) => {
  const id = c.req.param("id")
  const job = selectJobById.get(id) as Job | null
  if (!job) {
    return c.json({ error: "Job not found" }, 404)
  }

  deleteJob.run(id)
  auditLog("job_deleted", { jobId: id, name: job.name })
  return c.json({ ok: true })
})

// POST /api/jobs/:id/run — trigger a manual backup
jobs.post("/:id/run", authRequired, async (c) => {
  const id = c.req.param("id")
  const job = selectJobById.get(id) as Job | null
  if (!job) {
    return c.json({ error: "Job not found" }, 404)
  }

  // Create a pending run
  const runId = newId()
  db.query(`
    INSERT INTO runs (id, job_id, agent_id, status, triggered_by, created_at)
    VALUES (?, ?, ?, 'pending', 'manual', ?)
  `).run(runId, id, job.agent_id, now())

  auditLog("backup_triggered", { jobId: id, runId, triggeredBy: "manual" })
  return c.json({ runId })
})

// POST /api/jobs/:id/test — test a job configuration (dry run)
jobs.post("/:id/test", authRequired, async (c) => {
  const id = c.req.param("id")
  const job = selectJobById.get(id) as Job | null
  if (!job) {
    return c.json({ error: "Job not found" }, 404)
  }

  // Validate that all sources exist and belong to the right agent
  const sourceIds = JSON.parse(job.sources) as string[]
  const sources = sourceIds.length > 0
    ? db.query(`SELECT * FROM sources WHERE id IN (${sourceIds.map(() => "?").join(",")}) AND agent_id = ?`).all(...sourceIds, job.agent_id)
    : []

  // Validate agent exists
  const agent = db.query("SELECT * FROM agents WHERE id = ?").get(job.agent_id)

  return c.json({
    valid: sources.length === sourceIds.length && !!agent,
    agent: agent ? { id: (agent as any).id, name: (agent as any).name, status: (agent as any).status } : null,
    sources: sources.map((s: any) => ({ id: s.id, name: s.name, type: s.type })),
    missingSources: sourceIds.filter((sid) => !sources.find((s: any) => s.id === sid)),
  })
})

export default jobs
