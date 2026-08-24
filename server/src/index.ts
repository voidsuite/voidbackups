/**
 * VoidBackups gateway — serves the built client (client/dist) plus the API:
 *   /api/auth/*       WebAuthn passkey authentication
 *   /api/agents/*     Agent management and coordination
 *   /api/sources/*    Backup source management
 *   /api/jobs/*       Backup job management
 *   /api/runs/*       Backup run history and logs
 *   /api/restore/*    Restore operations
 *   /api/wizard/*     Setup wizard
 *   /api/notifications/* Notification channel management
 *
 * Data lives in SQLite (DATA_DIR/voidbackups.db) — sign in once with your
 * passkey, manage backups across all your servers.
 */

import { Hono } from "hono"
import { cors } from "hono/cors"
import { fileURLToPath } from "node:url"
import path from "node:path"
import config from "./config.js"
import authRoutes from "./routes/auth.js"
import agentRoutes from "./routes/agents.js"
import sourceRoutes from "./routes/sources.js"
import jobRoutes from "./routes/jobs.js"
import runRoutes from "./routes/runs.js"
import restoreRoutes from "./routes/restore.js"
import wizardRoutes from "./routes/wizard.js"
import notificationRoutes from "./routes/notifications.js"
import { securityHeaders, csrfProtection } from "./middleware/security.js"
import { apiRateLimit, agentRateLimit } from "./middleware/rate-limit.js"
import { startScheduler } from "./lib/scheduler.js"
import { getConfig, setConfig } from "./db/webauthn.js"
import { randomHex } from "./db/connection.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, "../../client/dist")

const app = new Hono()

// --- Security headers (all responses) ---
app.use("*", securityHeaders)

// --- CORS ---
app.use(
  "*",
  cors({
    origin: config.allowedOrigins.length ? config.allowedOrigins : config.appUrl,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
)

// --- CSRF protection ---
app.use("*", csrfProtection)

// --- Request logging ---
app.use("*", async (c, next) => {
  await next()
  const res = c.res
  if (res.status >= 400) {
    const body = await res.clone().text().catch(() => "")
    console.log(`[http] ${c.req.method} ${c.req.path} -> ${res.status} ${body.slice(0, 200)}`)
  } else {
    console.log(`[http] ${c.req.method} ${c.req.path} -> ${res.status}`)
  }
})

// --- Rate limiting ---
app.use("/api/auth/*", apiRateLimit)
app.use("/api/agents/*", agentRateLimit)

// --- API routes ---
app.route("/api/auth", authRoutes)
app.route("/api/agents", agentRoutes)
app.route("/api/sources", sourceRoutes)
app.route("/api/jobs", jobRoutes)
app.route("/api/runs", runRoutes)
app.route("/api/restore", restoreRoutes)
app.route("/api/wizard", wizardRoutes)
app.route("/api/notifications", notificationRoutes)

// --- Health check ---
app.get("/health", (c) =>
  c.json({ status: "ok", service: "voidbackups", version: "0.1.0" })
)

// --- Public install script ---
// GET /api/install.sh — one-liner agent installer (generates a one-time setup token)
app.get("/api/install.sh", async (c) => {
  const serverUrl = config.appUrl
  const setupToken = randomHex(32)
  setConfig("agent_setup_token", setupToken)

  const script = `#!/bin/bash
# VoidBackups Agent Installer
# Server: ${serverUrl}
# Generated: ${new Date().toISOString()}
set -euo pipefail

SERVER_URL="${serverUrl}"
SETUP_TOKEN="${setupToken}"
AGENT_NAME="\${HOSTNAME:-$(hostname)}"
INSTALL_DIR="/opt/voidbackups"
AGENT_BIN="$INSTALL_DIR/voidbackups-agent"

echo "╔══════════════════════════════════════╗"
echo "║     VoidBackups Agent Installer      ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Server:  $SERVER_URL"
echo "Agent:   $AGENT_NAME"
echo ""

# Must run as root
if [ "\$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root (use sudo)"
  exit 1
fi

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
echo "Platform: $PLATFORM/$ARCH"

# Install restic if not present
if ! command -v restic &>/dev/null; then
  echo "Installing restic..."
  RESTIC_VERSION="0.17.3"
  RESTIC_URL="https://github.com/restic/restic/releases/download/v\${RESTIC_VERSION}/restic_\${RESTIC_VERSION}_\${PLATFORM}_\${ARCH}.bz2"
  curl -fsSL "\$RESTIC_URL" -o /tmp/restic.bz2
  # Try multiple decompressors
  if command -v bunzip2 &>/dev/null; then
    bunzip2 /tmp/restic.bz2
  elif command -v bzip2 &>/dev/null; then
    bzip2 -d /tmp/restic.bz2
  elif command -v pbzip2 &>/dev/null; then
    pbzip2 -d /tmp/restic.bz2
  elif command -v python3 &>/dev/null; then
    python3 -c "import bz2,sys; open('/tmp/restic','wb').write(bz2.decompress(open('/tmp/restic.bz2','rb').read()))"
    rm -f /tmp/restic.bz2
  else
    # Install bzip2 via package manager
    if command -v apt-get &>/dev/null; then
      apt-get install -y bzip2
      bunzip2 /tmp/restic.bz2
    elif command -v apk &>/dev/null; then
      apk add --no-cache bzip2
      bunzip2 /tmp/restic.bz2
    elif command -v yum &>/dev/null; then
      yum install -y bzip2
      bunzip2 /tmp/restic.bz2
    else
      echo "  ✗ Cannot decompress restic — install bzip2 manually"
      rm -f /tmp/restic.bz2
      exit 1
    fi
  fi
  mv /tmp/restic /usr/local/bin/restic
  chmod +x /usr/local/bin/restic
  rm -f /tmp/restic.bz2
  echo "  ✓ restic installed"
else
  # Ensure restic is executable
  RESTIC_PATH=$(command -v restic)
  chmod +x "$RESTIC_PATH" 2>/dev/null || true
  echo "  ✓ restic already installed ($(restic version 2>&1 | head -1))"
fi

# Download agent binary
echo "Downloading VoidBackups agent..."
mkdir -p "$INSTALL_DIR"
ARCHIVE_URL="$SERVER_URL/api/releases/voidbackups-agent-\${PLATFORM}_\${ARCH}.tar.gz"
HTTP_CODE=\$(curl -fsSL -w '%{http_code}' -o /tmp/voidbackups-agent.tar.gz "$ARCHIVE_URL")
if [ "\$HTTP_CODE" = "200" ]; then
  tar -xzf /tmp/voidbackups-agent.tar.gz -C "$INSTALL_DIR/"
  chmod +x "$AGENT_BIN"
  rm -f /tmp/voidbackups-agent.tar.gz
  echo "  ✓ agent binary installed"
else
  # Fallback: try to build from source if Go is available
  if command -v go &>/dev/null; then
    echo "  Binary not available, building from source..."
    TMPDIR=$(mktemp -d)
    cd "$TMPDIR"
    curl -fsSL "$SERVER_URL/api/releases/voidbackups-agent-source.tar.gz" | tar xz
    cd voidbackups-agent
    go build -o "$AGENT_BIN" .
    cd /
    rm -rf "$TMPDIR"
    echo "  ✓ agent built from source"
  else
    echo "  ✗ Could not download or build agent binary (HTTP $HTTP_CODE)"
    echo "  Place the agent binary at: $AGENT_BIN"
    echo "  Then re-run this script."
    exit 1
  fi
fi

# Register with server
echo "Registering with server..."
RESPONSE=$(curl -fsSL -X POST "$SERVER_URL/api/agents/register" \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"name\\": \\"\$AGENT_NAME\\",
    \\"hostname\\": \\"\$(hostname)\\",
    \\"setupToken\\": \\"\$SETUP_TOKEN\\",
    \\"tailscaleIp\\": \\"\$(tailscale ip -4 2>/dev/null || echo '')\\",
    \\"platform\\": \\"\$PLATFORM\\",
    \\"arch\\": \\"\$ARCH\\",
    \\"resticVersion\\": \\"\$(restic version 2>&1 | head -1 || echo '')\\"
  }")

AGENT_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
AGENT_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$AGENT_TOKEN" ]; then
  echo "  ✗ Registration failed. Response: $RESPONSE"
  exit 1
fi
echo "  ✓ Registered (ID: $AGENT_ID)"

# Save agent config
cat > "$INSTALL_DIR/agent.json" << EOFCFG
{
  "server_url": "$SERVER_URL",
  "agent_id": "$AGENT_ID",
  "agent_token": "$AGENT_TOKEN",
  "agent_name": "$AGENT_NAME"
}
EOFCFG
chmod 600 "$INSTALL_DIR/agent.json"
echo "  ✓ Config saved to $INSTALL_DIR/agent.json"

# Create systemd service
cat > /etc/systemd/system/voidbackups-agent.service << EOFUNIT
[Unit]
Description=VoidBackups Backup Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$AGENT_BIN daemon --config $INSTALL_DIR/agent.json
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOFUNIT

systemctl daemon-reload
systemctl enable voidbackups-agent
systemctl start voidbackups-agent
echo "  ✓ Systemd service created and started"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       Installation Complete!         ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Agent '$AGENT_NAME' is now connected to $SERVER_URL"
echo ""
echo "Commands:"
echo "  Status:  systemctl status voidbackups-agent"
echo "  Logs:    journalctl -u voidbackups-agent -f"
echo "  Stop:    systemctl stop voidbackups-agent"
`

  return new Response(script, {
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
})

// --- Agent binary releases ---
// GET /api/releases/:filename — serve compiled agent binaries
app.get("/api/releases/:filename", async (c) => {
  const filename = c.req.param("filename")
  // Only allow specific binary patterns
  if (!/^voidbackups-agent-(linux|darwin)_(amd64|arm64|armv7)(\.tar\.gz)?$/.test(filename)) {
    return c.json({ error: "Not found" }, 404)
  }
  const filePath = path.resolve(__dirname, "../../releases", filename)
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return c.json({ error: "Binary not found. Build the agent first: cd agent && GOOS=linux GOARCH=amd64 go build -o ../releases/voidbackups-agent-linux_amd64 ." }, 404)
  }
  return new Response(file, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": "attachment; filename=\"" + filename + "\"",
    },
  })
})

// --- Static client + SPA fallback ---
const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  txt: "text/plain",
  map: "application/json",
  webmanifest: "application/manifest+json",
}

app.get("*", async (c) => {
  const reqPath = c.req.path
  const filePath = reqPath === "/" ? "/index.html" : reqPath
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  const f = Bun.file(path.join(DIST_DIR, filePath))
  const exists = await f.exists()

  if (exists) {
    return new Response(f, {
      headers: { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" },
    })
  }
  if (!reqPath.startsWith("/api/")) {
    const fallback = Bun.file(path.join(DIST_DIR, "index.html"))
    if (await fallback.exists()) {
      return new Response(fallback, { headers: { "Content-Type": "text/html" } })
    }
  }
  return c.json({ error: "Not found" }, 404)
})

// --- Start scheduler ---
startScheduler()

console.log(`[voidbackups] gateway starting on :${config.port} (${config.appUrl})`)

export default {
  port: config.port,
  fetch: app.fetch,
}
