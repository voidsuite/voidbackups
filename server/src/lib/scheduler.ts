/**
 * Job scheduler — manages cron, interval, and event-triggered backups.
 * Runs as a background loop checking for due jobs.
 */

import db, { now, randomHex } from "../db/connection.js"
import config from "../config.js"

interface ScheduledJob {
  id: string
  name: string
  agent_id: string
  schedule: string
  sources: string
  enabled: number
  next_run: number | null
}

interface ScheduledRun {
  id: string
  job_id: string
  next_run: number
  interval_ms: number | null
  cron_expr: string | null
  timezone: string
  enabled: number
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null

/**
 * Start the scheduler loop.
 */
export function startScheduler(): void {
  if (schedulerInterval) return

  console.log("[scheduler] Starting job scheduler")
  schedulerInterval = setInterval(checkAndRunJobs, 60_000) // Check every minute
}

/**
 * Stop the scheduler loop.
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }
}

/**
 * Check for due jobs and create pending runs.
 */
function checkAndRunJobs(): void {
  const ts = now()

  // Find scheduled runs that are due
  const dueRuns = db.query(`
    SELECT sr.*, j.name as job_name, j.agent_id, j.enabled as job_enabled
    FROM scheduled_runs sr
    JOIN jobs j ON j.id = sr.job_id
    WHERE sr.enabled = 1
      AND j.enabled = 1
      AND sr.next_run <= ?
    ORDER BY sr.next_run ASC
    LIMIT 10
  `).all(ts) as Array<ScheduledRun & { job_name: string; agent_id: string; job_enabled: number }>

  for (const run of dueRuns) {
    // Check conditions before creating the run
    if (!evaluateConditions(run.job_id)) {
      console.log(`[scheduler] Skipping job ${run.job_name} — conditions not met`)
      updateNextRun(run)
      continue
    }

    // Create a pending run
    const runId = randomHex(16)
    db.query(`
      INSERT INTO runs (id, job_id, agent_id, status, triggered_by, created_at)
      VALUES (?, ?, ?, 'pending', 'scheduler', ?)
    `).run(runId, run.job_id, run.agent_id, ts)

    console.log(`[scheduler] Created run ${runId} for job ${run.job_name}`)

    // Update next run time
    updateNextRun(run)
  }
}

/**
 * Update the next_run time for a scheduled run.
 */
function updateNextRun(run: ScheduledRun): void {
  let nextRun: number

  if (run.interval_ms) {
    nextRun = now() + run.interval_ms
  } else if (run.cron_expr) {
    nextRun = getNextCronRun(run.cron_expr, run.timezone)
  } else {
    nextRun = now() + 3600_000 // Default: 1 hour
  }

  db.query("UPDATE scheduled_runs SET next_run = ? WHERE id = ?").run(nextRun, run.id)

  // Also update the job's next_run
  db.query("UPDATE jobs SET next_run = ? WHERE id = ?").run(nextRun, run.job_id)
}

/**
 * Evaluate conditions for a job.
 * Returns true if the job should run.
 */
function evaluateConditions(jobId: string): boolean {
  const job = db.query("SELECT conditions FROM jobs WHERE id = ?").get(jobId) as { conditions: string } | null
  if (!job) return false

  const conditions = JSON.parse(job.conditions || "[]") as Array<{
    type: string
    max_percent?: number
    idle_minutes?: number
    min_disk_free_gb?: number
  }>

  for (const condition of conditions) {
    switch (condition.type) {
      case "disk_usage": {
        // Check if disk usage is below threshold
        // This is a simplified check — in production you'd use statvfs
        break
      }
      case "idle_only": {
        // Check if system is idle (load average)
        // Simplified: always allow
        break
      }
      case "min_disk_free": {
        // Check minimum free disk space
        break
      }
    }
  }

  return true // Default: allow
}

/**
 * Simple cron expression parser — returns the next run time.
 * Supports basic cron: * * * * * (minute hour day month weekday)
 */
function getNextCronRun(cronExpr: string, timezone: string): number {
  const parts = cronExpr.split(" ")
  if (parts.length !== 5) return now() + 3600_000

  const [minute, hour, day, month, weekday] = parts
  const now_date = new Date()

  // Simple approximation — next matching time
  // For production, use a proper cron library
  const next = new Date(now_date)
  next.setMinutes(next.getMinutes() + 1)
  next.setSeconds(0)
  next.setMilliseconds(0)

  // Try up to 7 days ahead
  for (let i = 0; i < 7 * 24 * 60; i++) {
    if (matchesCron(next, minute, hour, day, month, weekday)) {
      return next.getTime()
    }
    next.setMinutes(next.getMinutes() + 1)
  }

  return now() + 3600_000 // Fallback
}

function matchesCron(date: Date, minute: string, hour: string, day: string, month: string, weekday: string): boolean {
  if (minute !== "*" && !matchField(date.getMinutes(), minute)) return false
  if (hour !== "*" && !matchField(date.getHours(), hour)) return false
  if (day !== "*" && !matchField(date.getDate(), day)) return false
  if (month !== "*" && !matchField(date.getMonth() + 1, month)) return false
  if (weekday !== "*" && !matchField(date.getDay(), weekday)) return false
  return true
}

function matchField(value: number, pattern: string): boolean {
  if (pattern === "*") return true
  if (pattern.includes(",")) {
    return pattern.split(",").some(p => matchField(value, p.trim()))
  }
  if (pattern.includes("-")) {
    const [min, max] = pattern.split("-").map(Number)
    return value >= min && value <= max
  }
  if (pattern.includes("/")) {
    const [_, step] = pattern.split("/")
    return value % parseInt(step) === 0
  }
  return value === parseInt(pattern)
}

/**
 * Create a scheduled run for a job.
 */
export function scheduleJob(jobId: string, schedule: { type: string; cron?: string; intervalMs?: number; timezone?: string }): void {
  const id = randomHex(16)
  const nextRun = schedule.type === "cron"
    ? getNextCronRun(schedule.cron || "* * * * *", schedule.timezone || "UTC")
    : now() + (schedule.intervalMs || 3600_000)

  db.query(`
    INSERT OR REPLACE INTO scheduled_runs (id, job_id, next_run, interval_ms, cron_expr, timezone, enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(id, jobId, nextRun, schedule.intervalMs || null, schedule.cron || null, schedule.timezone || "UTC")

  // Update job's next_run
  db.query("UPDATE jobs SET next_run = ? WHERE id = ?").run(nextRun, jobId)
}

/**
 * Remove a scheduled run for a job.
 */
export function unscheduleJob(jobId: string): void {
  db.query("DELETE FROM scheduled_runs WHERE job_id = ?").run(jobId)
  db.query("UPDATE jobs SET next_run = NULL WHERE id = ?").run(jobId)
}
