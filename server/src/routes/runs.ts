/**
 * /api/runs/* — Backup run history and logs.
 */

import { Hono } from "hono"
import { authRequired } from "../middleware/auth.js"
import db from "../db/connection.js"

const runs = new Hono()

// GET /api/runs — list all runs (with pagination and filters)
runs.get("/", authRequired, async (c) => {
  const page = parseInt(c.req.query("page") || "1", 10)
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 100)
  const offset = (page - 1) * limit
  const status = c.req.query("status")
  const jobId = c.req.query("jobId")
  const agentId = c.req.query("agentId")

  let query = `
    SELECT r.*, j.name as job_name, a.name as agent_name
    FROM runs r
    LEFT JOIN jobs j ON j.id = r.job_id
    LEFT JOIN agents a ON a.id = r.agent_id
    WHERE 1=1
  `
  const params: any[] = []

  if (status) {
    query += " AND r.status = ?"
    params.push(status)
  }
  if (jobId) {
    query += " AND r.job_id = ?"
    params.push(jobId)
  }
  if (agentId) {
    query += " AND r.agent_id = ?"
    params.push(agentId)
  }

  const countQuery = query.replace("SELECT r.*, j.name as job_name, a.name as agent_name", "SELECT COUNT(*) as total")
  const totalRow = db.query(countQuery).get(...params) as { total: number }

  query += " ORDER BY r.created_at DESC LIMIT ? OFFSET ?"
  params.push(limit, offset)

  const rows = db.query(query).all(...params) as any[]

  return c.json({
    runs: rows.map((r) => ({
      ...r,
      logs: undefined, // Don't include logs in list view
    })),
    pagination: {
      page,
      limit,
      total: totalRow.total,
      pages: Math.ceil(totalRow.total / limit),
    },
  })
})

// GET /api/runs/:id — get a specific run with logs
runs.get("/:id", authRequired, async (c) => {
  const id = c.req.param("id")
  const row = db.query(`
    SELECT r.*, j.name as job_name, a.name as agent_name
    FROM runs r
    LEFT JOIN jobs j ON j.id = r.job_id
    LEFT JOIN agents a ON a.id = r.agent_id
    WHERE r.id = ?
  `).get(id) as any

  if (!row) {
    return c.json({ error: "Run not found" }, 404)
  }

  return c.json(row)
})

// GET /api/runs/:id/logs — get logs for a specific run
runs.get("/:id/logs", authRequired, async (c) => {
  const id = c.req.param("id")
  const row = db.query("SELECT logs FROM runs WHERE id = ?").get(id) as { logs: string } | null

  if (!row) {
    return c.json({ error: "Run not found" }, 404)
  }

  return c.json({ logs: row.logs })
})

// DELETE /api/runs/:id — delete a run record
runs.delete("/:id", authRequired, async (c) => {
  const id = c.req.param("id")
  const row = db.query("SELECT id FROM runs WHERE id = ?").get(id)
  if (!row) {
    return c.json({ error: "Run not found" }, 404)
  }

  db.query("DELETE FROM runs WHERE id = ?").run(id)
  return c.json({ ok: true })
})

// GET /api/runs/stats — get overall backup statistics
runs.get("/stats/overview", authRequired, async (c) => {
  const totalRuns = (db.query("SELECT COUNT(*) as count FROM runs").get() as any).count
  const successfulRuns = (db.query("SELECT COUNT(*) as count FROM runs WHERE status = 'success'").get() as any).count
  const failedRuns = (db.query("SELECT COUNT(*) as count FROM runs WHERE status = 'failed'").get() as any).count
  const totalBytesBackedUp = (db.query("SELECT COALESCE(SUM(bytes_new), 0) as total FROM runs WHERE status = 'success'").get() as any).total

  const last24h = Date.now() - 24 * 60 * 60 * 1000
  const runsLast24h = (db.query("SELECT COUNT(*) as count FROM runs WHERE created_at > ?").get(last24h) as any).count

  const avgDuration = (db.query(
    "SELECT COALESCE(AVG(duration_ms), 0) as avg FROM runs WHERE status = 'success' AND duration_ms IS NOT NULL"
  ).get() as any).avg

  return c.json({
    totalRuns,
    successfulRuns,
    failedRuns,
    successRate: totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0,
    totalBytesBackedUp,
    runsLast24h,
    avgDurationMs: Math.round(avgDuration),
  })
})

export default runs
