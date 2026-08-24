# VoidBackups

Private infrastructure backup manager for VoidInfrastructure. Passkey-only auth, restic-powered encrypted backups, Tailscale-only access.

## Features

- **Passkey-only authentication** — no passwords, no OAuth, just your device's passkey
- **Encrypted backups** — AES-256 encryption at rest via restic
- **Smart deduplication** — content-defined chunking saves storage
- **Multi-server support** — manage backups across all your servers via Tailscale
- **Flexible scheduling** — cron, interval, event-triggered, or manual backups
- **Auto-discovery** — automatically detect Docker volumes, databases, and system configs
- **Notifications** — Telegram, webhooks, and email alerts
- **Restore interface** — browse and restore from backup snapshots

## Architecture

```
┌─────────────────────────────────────────┐
│     VoidBackups Server (Main Infra)     │
│  Web GUI + API + Scheduler + Notifier   │
└────────────────┬────────────────────────┘
                 │ Tailscale HTTPS
    ┌────────────┼────────────┐
    │            │            │
┌───▼───┐  ┌────▼───┐  ┌────▼───┐
│ Agent │  │ Agent  │  │ Agent  │
│ (Main)│  │ (Beta) │  │ (PC)   │
└───────┘  └────────┘  └────────┘
```

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/voidsuite/voidbackups.git
cd voidbackups
cp .env.example .env
# Edit .env with your configuration
```

### 2. Run with Docker Compose

```bash
docker compose up -d
```

### 3. First-time setup

1. Open `http://your-server:3010` in your browser
2. Create your admin passkey account
3. Configure storage location
4. Generate encryption key
5. Install agents on your servers

### 4. Install agents

On each server you want to back up:

```bash
curl -fsSL http://your-server:3010/api/install.sh | bash
```

## Development

### Server

```bash
cd server
bun install
bun run dev
```

### Client

```bash
cd client
bun install
bun run dev
```

### Agent

```bash
cd agent
go build -o voidbackups-agent .
```

## Configuration

See `.env.example` for all configuration options.

### Key settings

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3010` | Server port |
| `RP_ID` | `localhost` | WebAuthn Relying Party ID (use your Tailscale hostname) |
| `DATA_DIR` | `./data` | Data directory for SQLite and backup repos |

## Security

- **WebAuthn passkey auth** — no passwords stored, biometric/security key only
- **Encrypted backups** — AES-256 encryption via restic
- **Tailscale-only access** — no public internet exposure
- **Session security** — httpOnly cookies, CSRF protection, rate limiting
- **Agent tokens** — hashed tokens, HTTPS communication only

## Tech Stack

- **Server**: Bun + Hono + TypeScript
- **Client**: React 19 + Vite + Tailwind CSS v4 + shadcn/ui
- **Agent**: Go (single binary)
- **Database**: SQLite (WAL mode)
- **Backups**: restic
- **Auth**: WebAuthn (passkey-only)
- **Network**: Tailscale

## License

MIT
