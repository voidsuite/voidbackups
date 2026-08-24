-- VoidBackups schema (SQLite).
-- Single-user, passkey-only auth. All timestamps are epoch milliseconds.

-- Single user (passkey-only auth)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL UNIQUE,     -- WebAuthn credential ID (base64url)
  public_key    TEXT NOT NULL,            -- WebAuthn public key (JSON JWK)
  counter       INTEGER NOT NULL DEFAULT 0, -- Signature counter (anti-replay)
  name          TEXT NOT NULL DEFAULT 'admin',
  created_at    INTEGER NOT NULL,
  last_login    INTEGER
);

-- WebAuthn challenges (pending registration/authentication)
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge   TEXT PRIMARY KEY,
  user_id     TEXT,                        -- NULL during registration
  type        TEXT NOT NULL,               -- 'registration' or 'authentication'
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Session storage (httpOnly cookie)
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Agents (remote servers running the backup agent)
CREATE TABLE IF NOT EXISTS agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  hostname        TEXT NOT NULL,
  tailscale_ip    TEXT,
  status          TEXT NOT NULL DEFAULT 'offline', -- online | offline | error
  platform        TEXT,                            -- linux, darwin, etc.
  arch            TEXT,                            -- amd64, arm64, etc.
  restic_version  TEXT,
  last_seen       INTEGER,
  registered_at   INTEGER NOT NULL,
  token_hash      TEXT NOT NULL                    -- SHA-256 hash of agent auth token
);

-- Backup sources (what to back up)
CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,              -- docker_volume | docker_container | sqlite | postgresql | mysql | redis | path
  name        TEXT NOT NULL,
  path        TEXT NOT NULL,
  metadata    TEXT DEFAULT '{}',          -- JSON: container name, db type, etc.
  discovered  INTEGER NOT NULL DEFAULT 0, -- 1 if auto-detected
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);

-- Backup jobs (schedules + configuration)
CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  schedule    TEXT NOT NULL,              -- JSON: { type: "cron"|"event"|"interval"|"manual", ... }
  sources     TEXT NOT NULL,              -- JSON array of source IDs
  retention   TEXT NOT NULL,              -- JSON: retention policy
  storage     TEXT NOT NULL,              -- JSON: { type: "local"|"remote"|"s3", ... }
  encryption  TEXT NOT NULL DEFAULT '{}', -- JSON: encryption config
  conditions  TEXT DEFAULT '[]',          -- JSON array of conditions
  enabled     INTEGER NOT NULL DEFAULT 1,
  last_run    INTEGER,
  next_run    INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Backup runs (execution history)
CREATE TABLE IF NOT EXISTS runs (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | running | success | failed | cancelled
  started_at      INTEGER,
  finished_at     INTEGER,
  duration_ms     INTEGER,
  bytes_new       INTEGER DEFAULT 0,
  bytes_total     INTEGER DEFAULT 0,
  files_new       INTEGER DEFAULT 0,
  files_changed   INTEGER DEFAULT 0,
  files_total     INTEGER DEFAULT 0,
  error           TEXT,
  snapshot_id     TEXT,
  logs            TEXT DEFAULT '',
  triggered_by    TEXT NOT NULL DEFAULT 'scheduler', -- scheduler | manual | event
  created_at      INTEGER NOT NULL
);

-- Notification channels
CREATE TABLE IF NOT EXISTS notification_channels (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,              -- telegram | webhook | email
  name        TEXT NOT NULL,
  config      TEXT NOT NULL,              -- JSON: type-specific config
  events      TEXT NOT NULL DEFAULT '[]', -- JSON: which events to notify on
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);

-- System configuration
CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Encryption keys (wrapped with passkey-derived key)
CREATE TABLE IF NOT EXISTS encryption_keys (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,             -- Encrypted restic repository password
  created_at  INTEGER NOT NULL
);

-- Scheduled job runs (for cron/interval scheduling)
CREATE TABLE IF NOT EXISTS scheduled_runs (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  next_run    INTEGER NOT NULL,
  interval_ms INTEGER,                   -- For interval-based schedules
  cron_expr   TEXT,                      -- For cron-based schedules
  timezone    TEXT DEFAULT 'UTC',
  enabled     INTEGER NOT NULL DEFAULT 1
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  action     TEXT NOT NULL,
  details    TEXT DEFAULT '{}',
  ip_address TEXT,
  created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_runs_job ON runs(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_sources_agent ON sources(agent_id);
CREATE INDEX IF NOT EXISTS idx_jobs_agent ON jobs(agent_id);
CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON jobs(next_run) WHERE enabled = 1;
CREATE INDEX IF NOT EXISTS idx_scheduled_runs_next ON scheduled_runs(next_run) WHERE enabled = 1;
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
