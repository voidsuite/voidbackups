/**
 * /api/agents/* — Agent management endpoints.
 * Agents register, heartbeat, poll for tasks, and report results.
 */

import { Hono } from "hono"
import { authRequired } from "../middleware/auth.js"
import { newId, newToken, hashToken, timingSafeEqual } from "../lib/ids.js"
import { now, randomHex } from "../db/connection.js"
import { auditLog } from "../db/webauthn.js"
import db from "../db/connection.js"
import config from "../config.js"

const agents = new Hono()

// --- Agent DB helpers ---

interface Agent {
  id: string
  name: string
  hostname: string
  tailscale_ip: string | null
  status: string
  platform: string | null
  arch: string | null
  restic_version: string | null
  last_seen: number | null
  registered_at: number
  token_hash: string
}

const insertAgent = db.query(`
  INSERT INTO agents (id, name, hostname, tailscale_ip, status, platform, arch, restic_version, last_seen, registered_at, token_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const selectAllAgents = db.query("SELECT * FROM agents ORDER BY registered_at DESC")
const selectAgentById = db.query("SELECT * FROM agents WHERE id = ?")
const updateAgentHeartbeat = db.query(`
  UPDATE agents SET status = 'online', last_seen = ?, platform = ?, arch = ?, restic_version = ?, tailscale_ip = ?
  WHERE id = ?
`)
const updateAgentStatus = db.query("UPDATE agents SET status = ? WHERE id = ?")
const deleteAgent = db.query("DELETE FROM agents WHERE id = ?")

// --- Agent API (authenticated with agent token) ---

// POST /api/agents/register — register a new agent (requires setup token from wizard)
agents.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body?.name || !body?.hostname || !body?.setupToken) {
    return c.json({ error: "Missing name, hostname, or setupToken" }, 400)
  }

  // Verify setup token
  const expectedSetupToken = config.getConfig?.("agent_setup_token") ?? null
  if (!expectedSetupToken || !timingSafeEqual(body.setupToken, expectedSetupToken)) {
    auditLog("agent_register_failed", { hostname: body.hostname }, c.req.header("x-forwarded-for"))
    return c.json({ error: "Invalid setup token" }, 403)
  }

  const agentId = newId()
  const agentToken = newToken()
  const tokenHash = await hashToken(agentToken)

  insertAgent.run(
    agentId,
    body.name,
    body.hostname,
    body.tailscaleIp ?? null,
    "online",
    body.platform ?? null,
    body.arch ?? null,
    body.resticVersion ?? null,
    now(),
    now(),
    tokenHash
  )

  auditLog("agent_registered", { agentId, name: body.name, hostname: body.hostname })

  // Return the agent token — this is the only time it's shown in plaintext
  return c.json({
    agent: { id: agentId, name: body.name },
    token: agentToken,
  })
})

// --- Agent-authenticated endpoints (Bearer token) ---

function agentAuthMiddleware() {
  return async (c: any, next: any) => {
    const header = c.req.header("Authorization") || ""
    const match = /^Bearer\s+(.+)$/i.exec(header)
    if (!match) {
      return c.json({ error: "Missing agent token" }, 401)
    }

    // We need to look up the agent by checking all token hashes
    // This is O(n) but n is small (a few servers at most)
    const allAgents = selectAllAgents.all() as Agent[]
    let foundAgent: Agent | null = null

    for (const agent of allAgents) {
      const hash = await hashToken(match[1])
      if (timingSafeEqual(hash, agent.token_hash)) {
        foundAgent = agent
        break
      }
    }

    if (!foundAgent) {
      return c.json({ error: "Invalid agent token" }, 401)
    }

    c.set("agent", foundAgent)
    await next()
  }
}

// POST /api/agents/heartbeat — agent check-in
agents.post("/heartbeat", agentAuthMiddleware(), async (c) => {
  const agent = c.get("agent") as Agent
  const body = await c.req.json().catch(() => ({}))

  updateAgentHeartbeat.run(
    now(),
    body.platform ?? agent.platform,
    body.arch ?? agent.arch,
    body.resticVersion ?? agent.restic_version,
    body.tailscaleIp ?? agent.tailscale_ip,
    agent.id
  )

  // Check for pending tasks for this agent
  const pendingTasks = db.query(`
    SELECT * FROM runs WHERE agent_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 5
  `).all(agent.id)

  return c.json({
    ok: true,
    pendingTasks: pendingTasks.length,
    serverTime: now(),
  })
})

// GET /api/agents/tasks — poll for pending backup tasks
agents.get("/tasks", agentAuthMiddleware(), async (c) => {
  const agent = c.get("agent") as Agent

  const tasks = db.query(`
    SELECT r.*, j.name as job_name, j.storage, j.encryption, j.sources
    FROM runs r
    JOIN jobs j ON j.id = r.job_id
    WHERE r.agent_id = ? AND r.status = 'pending'
    ORDER BY r.created_at ASC
    LIMIT 5
  `).all(agent.id) as any[]

  // For each task, resolve source paths
  const tasksWithSources = tasks.map((task) => {
    const sourceIds = JSON.parse(task.sources) as string[]
    const sourceList = sourceIds.length > 0
      ? db.query(`SELECT * FROM sources WHERE id IN (${sourceIds.map(() => "?").join(",")})`).all(...sourceIds)
      : []
    return {
      ...task,
      sources_detail: sourceList,
      storage_config: JSON.parse(task.storage),
      encryption_config: JSON.parse(task.encryption),
    }
  })

  return c.json({ tasks: tasksWithSources })
})

// POST /api/agents/tasks/:taskId/start — agent started executing a task
agents.post("/tasks/:taskId/start", agentAuthMiddleware(), async (c) => {
  const taskId = c.req.param("taskId")
  const agent = c.get("agent") as Agent

  db.query("UPDATE runs SET status = 'running', started_at = ? WHERE id = ? AND agent_id = ?")
    .run(now(), taskId, agent.id)

  return c.json({ ok: true })
})

// POST /api/agents/tasks/:taskId/progress — agent reports progress
agents.post("/tasks/:taskId/progress", agentAuthMiddleware(), async (c) => {
  const taskId = c.req.param("taskId")
  const agent = c.get("agent") as Agent
  const body = await c.req.json().catch(() => ({}))

  // Append to logs
  const existing = db.query("SELECT logs FROM runs WHERE id = ? AND agent_id = ?").get(taskId, agent.id) as any
  if (existing) {
    const newLogs = body.log ? existing.logs + body.log + "\n" : existing.logs
    db.query("UPDATE runs SET logs = ? WHERE id = ?").run(newLogs, taskId)
  }

  return c.json({ ok: true })
})

// POST /api/agents/tasks/:taskId/result — agent finished a task
agents.post("/tasks/:taskId/result", agentAuthMiddleware(), async (c) => {
  const taskId = c.req.param("taskId")
  const agent = c.get("agent") as Agent
  const body = await c.req.json().catch(() => null)

  if (!body?.status) {
    return c.json({ error: "Missing status" }, 400)
  }

  const finishedAt = now()
  const run = db.query("SELECT * FROM runs WHERE id = ? AND agent_id = ?").get(taskId, agent.id) as any

  if (!run) {
    return c.json({ error: "Task not found" }, 404)
  }

  const durationMs = run.started_at ? finishedAt - run.started_at : null

  db.query(`
    UPDATE runs SET
      status = ?,
      finished_at = ?,
      duration_ms = ?,
      bytes_new = ?,
      bytes_total = ?,
      files_new = ?,
      files_changed = ?,
      files_total = ?,
      error = ?,
      snapshot_id = ?,
      logs = ?
    WHERE id = ?
  `).run(
    body.status,
    finishedAt,
    durationMs,
    body.bytesNew ?? 0,
    body.bytesTotal ?? 0,
    body.filesNew ?? 0,
    body.filesChanged ?? 0,
    body.filesTotal ?? 0,
    body.error ?? null,
    body.snapshotId ?? null,
    body.logs ?? run.logs,
    taskId
  )

  // Update job's last_run
  db.query("UPDATE jobs SET last_run = ? WHERE id = ?").run(finishedAt, run.job_id)

  auditLog("backup_completed", {
    taskId,
    jobId: run.job_id,
    status: body.status,
    durationMs,
  })

  return c.json({ ok: true })
})

// --- Admin endpoints (session-authenticated) ---

// GET /api/agents — list all agents
agents.get("/", authRequired, async (c) => {
  const allAgents = selectAllAgents.all() as Agent[]

  // Mark agents as offline if they haven't heartbeat recently
  const offlineThreshold = now() - config.agentOfflineThreshold * 1000
  for (const agent of allAgents) {
    if (agent.status === "online" && agent.last_seen && agent.last_seen < offlineThreshold) {
      updateAgentStatus.run("offline", agent.id)
      agent.status = "offline"
    }
  }

  // Don't expose token hashes
  const safe = allAgents.map(({ token_hash, ...rest }) => rest)
  return c.json(safe)
})

// DELETE /api/agents/:id — remove an agent
agents.delete("/:id", authRequired, async (c) => {
  const id = c.req.param("id")
  const agent = selectAgentById.get(id) as Agent | null
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404)
  }

  deleteAgent.run(id)
  auditLog("agent_deleted", { agentId: id, name: agent.name })
  return c.json({ ok: true })
})

// POST /api/agents/:id/regenerate-token — rotate agent token
agents.post("/:id/regenerate-token", authRequired, async (c) => {
  const id = c.req.param("id")
  const agent = selectAgentById.get(id) as Agent | null
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404)
  }

  const newAgentToken = newToken()
  const tokenHash = await hashToken(newAgentToken)
  db.query("UPDATE agents SET token_hash = ? WHERE id = ?").run(tokenHash, id)

  auditLog("agent_token_regenerated", { agentId: id })
  return c.json({ token: newAgentToken })
})

// GET /api/agents/:id/install-script — get the install script for an agent
agents.get("/:id/install-script", authRequired, async (c) => {
  const agentId = c.req.param("id")
  const setupToken = randomHex(32)

  // Store the setup token temporarily
  const { setConfig } = await import("../db/webauthn.js")
  setConfig("agent_setup_token", setupToken)

  const serverUrl = config.appUrl

  const script = `#!/bin/bash
# VoidBackups Agent Installer
# Generated for agent: ${agentId}
# Server: ${serverUrl}

set -euo pipefail

SERVER_URL="${serverUrl}"
SETUP_TOKEN="${setupToken}"
AGENT_NAME="\${HOSTNAME:-$(hostname)}"

echo "=== VoidBackups Agent Installer ==="
echo "Server: $SERVER_URL"
echo "Agent name: $AGENT_NAME"
echo ""

# Detect platform
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  armv7l)  ARCH="armv7" ;;
  *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

case "$PLATFORM" in
  linux)  PLATFORM="linux" ;;
  darwin) PLATFORM="darwin" ;;
  *)      echo "Unsupported platform: $PLATFORM"; exit 1 ;;
esac

echo "Detected: $PLATFORM/$ARCH"

# Install restic if not present
if ! command -v restic &>/dev/null; then
  echo "Installing restic..."
  RESTIC_VERSION="0.17.3"
  curl -fsSL "https://github.com/restic/restic/releases/download/v\${RESTIC_VERSION}/restic_\${RESTIC_VERSION}_\${PLATFORM}_\${ARCH}.bz2" | bunzip2 > /usr/local/bin/restic
  chmod +x /usr/local/bin/restic
  echo "Restic installed."
else
  echo "Restic already installed: $(restic version)"
fi

# Install agent binary
echo "Installing VoidBackups agent..."
INSTALL_DIR="/opt/voidbackups"
mkdir -p "$INSTALL_DIR"

# Download agent binary (placeholder — replace with actual release URL)
echo "Agent binary would be downloaded here from: $SERVER_URL/api/releases/voidbackups-agent-\${PLATFORM}_\${ARCH}"

# Create config file
cat > "$INSTALL_DIR/agent.json" << EOF
{
  "server_url": "$SERVER_URL",
  "agent_name": "$AGENT_NAME",
  "setup_token": "$SETUP_TOKEN"
}
EOF

# Create systemd service
cat > /etc/systemd/system/voidbackups-agent.service << EOF
[Unit]
Description=VoidBackups Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/voidbackups-agent daemon --config $INSTALL_DIR/agent.json
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable voidbackups-agent
systemctl start voidbackups-agent

echo ""
echo "=== Installation Complete ==="
echo "Agent '$AGENT_NAME' is now running and connected to $SERVER_URL"
echo "Status: systemctl status voidbackups-agent"
echo "Logs:   journalctl -u voidbackups-agent -f"
`

  return c.json({ script, setupToken })
})

export default agents
