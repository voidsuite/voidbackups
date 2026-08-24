/**
 * /api/restore/* — Restore operations.
 * Browse snapshots, list files, and restore from backups.
 */

import { Hono } from "hono"
import { authRequired } from "../middleware/auth.js"
import { newId } from "../lib/ids.js"
import { now } from "../db/connection.js"
import { auditLog } from "../db/webauthn.js"
import db from "../db/connection.js"
import * as restic from "../lib/restic.js"
import config from "../config.js"

const restore = new Hono()

// GET /api/restore/snapshots/:jobId — list snapshots for a job
restore.get("/snapshots/:jobId", authRequired, async (c) => {
  const jobId = c.req.param("jobId")

  // Get the job to find the agent and storage config
  const job = db.query("SELECT * FROM jobs WHERE id = ?").get(jobId) as any
  if (!job) {
    return c.json({ error: "Job not found" }, 404)
  }

  // Get the agent
  const agent = db.query("SELECT * FROM agents WHERE id = ?").get(job.agent_id) as any
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404)
  }

  // Get the repo path and password
  const storage = JSON.parse(job.storage)
  const encryption = JSON.parse(job.encryption || "{}")
  const repoPath = storage.path
    ? `${storage.path}/repos/${jobId}`
    : `${config.dataDir}/repos/${jobId}`

  // For now, return run history as a proxy for snapshots
  // In production, the agent would report snapshot IDs
  const runs = db.query(`
    SELECT id, snapshot_id, started_at, finished_at, status, bytes_new, files_new
    FROM runs
    WHERE job_id = ? AND status = 'success' AND snapshot_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 50
  `).all(jobId) as any[]

  return c.json({
    job: { id: job.id, name: job.name },
    agent: { id: agent.id, name: agent.name },
    snapshots: runs.map((r) => ({
      id: r.snapshot_id,
      runId: r.id,
      time: r.started_at,
      duration: r.finished_at ? r.finished_at - r.started_at : null,
      bytes: r.bytes_new,
      files: r.files_new,
    })),
  })
})

// GET /api/restore/files/:jobId/:snapshotId — list files in a snapshot
restore.get("/files/:jobId/:snapshotId", authRequired, async (c) => {
  const jobId = c.req.param("jobId")
  const snapshotId = c.req.param("snapshotId")
  const path = c.req.query("path") || "/"

  // Get job config
  const job = db.query("SELECT * FROM jobs WHERE id = ?").get(jobId) as any
  if (!job) {
    return c.json({ error: "Job not found" }, 404)
  }

  const storage = JSON.parse(job.storage)
  const repoPath = storage.path
    ? `${storage.path}/repos/${jobId}`
    : `${config.dataDir}/repos/${jobId}`

  // TODO: In production, get the encryption password from the key store
  // For now, we'd need the agent to perform this operation
  // since the server doesn't have direct access to the repo

  return c.json({
    snapshotId,
    path,
    files: [],
    message: "File listing requires agent cooperation. Use the agent's restore endpoint.",
  })
})

// POST /api/restore/trigger — trigger a restore operation
restore.post("/trigger", authRequired, async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.jobId || !body?.snapshotId) {
    return c.json({ error: "Missing jobId or snapshotId" }, 400)
  }

  const job = db.query("SELECT * FROM jobs WHERE id = ?").get(body.jobId) as any
  if (!job) {
    return c.json({ error: "Job not found" }, 404)
  }

  const target = body.target || "/tmp/voidbackups-restore"
  const includePath = body.path

  // Create a restore run
  const runId = newId()
  db.query(`
    INSERT INTO runs (id, job_id, agent_id, status, triggered_by, created_at)
    VALUES (?, ?, ?, 'pending', 'manual', ?)
  `).run(runId, body.jobId, job.agent_id, now())

  // Store restore metadata
  db.query(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES (?, ?, ?)
  `).run(`restore:${runId}`, JSON.stringify({
    snapshotId: body.snapshotId,
    target,
    includePath,
  }), now())

  auditLog("restore_triggered", {
    jobId: body.jobId,
    snapshotId: body.snapshotId,
    target,
  })

  return c.json({ runId, message: "Restore queued. The agent will execute it." })
})

// GET /api/restore/status/:runId — check restore status
restore.get("/status/:runId", authRequired, async (c) => {
  const runId = c.req.param("runId")
  const run = db.query("SELECT * FROM runs WHERE id = ?").get(runId) as any
  if (!run) {
    return c.json({ error: "Run not found" }, 404)
  }

  return c.json({
    id: run.id,
    status: run.status,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    error: run.error,
    logs: run.logs,
  })
})

export default restore
