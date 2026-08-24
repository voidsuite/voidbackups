/**
 * Notification dispatcher — sends alerts to configured channels.
 * Supports Discord embeds, Telegram, and generic webhooks.
 */

import db from "../db/connection.js"

const VOIDBACKUPS_COLOR = 0x131416 // accent color for Discord embeds

interface NotificationChannel {
  id: string
  type: string
  name: string
  config: string
  events: string
  enabled: number
}

type BackupEvent = "backup_completed" | "backup_failed" | "backup_started" | "restore_completed" | "restore_failed"

interface BackupEventData {
  jobName: string
  agentName?: string
  status: "success" | "error" | "running"
  durationMs?: number
  bytesNew?: number
  bytesTotal?: number
  filesNew?: number
  filesChanged?: number
  error?: string
  snapshotId?: string
}

/**
 * Dispatch a notification event to all matching enabled channels.
 */
export async function dispatchNotification(
  event: BackupEvent,
  data: BackupEventData
): Promise<void> {
  const channels = db.query(
    "SELECT * FROM notification_channels WHERE enabled = 1"
  ).all() as NotificationChannel[]

  for (const channel of channels) {
    const allowedEvents = JSON.parse(channel.events) as string[]
    if (!allowedEvents.includes(event)) continue

    const config = JSON.parse(channel.config)

    try {
      switch (channel.type) {
        case "discord":
          await sendDiscord(channel.name, config, event, data)
          break
        case "telegram":
          await sendTelegram(config, event, data)
          break
        case "webhook":
          await sendWebhook(config, event, data)
          break
      }
    } catch (err) {
      console.error(`[notifications] Failed to send to ${channel.name} (${channel.type}):`, (err as Error).message)
    }
  }
}

// --- Discord ---

async function sendDiscord(
  channelName: string,
  config: { webhookUrl: string },
  event: BackupEvent,
  data: BackupEventData
): Promise<void> {
  const embed = buildDiscordEmbed(event, data)

  const payload = {
    username: "VoidBackups",
    avatar_url: "",
    embeds: [embed],
  }

  const res = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Discord webhook returned ${res.status}: ${body.slice(0, 200)}`)
  }
}

function buildDiscordEmbed(event: BackupEvent, data: BackupEventData) {
  const duration = data.durationMs != null ? formatDuration(data.durationMs) : null
  const size = data.bytesNew != null ? formatBytes(data.bytesNew) : null
  const totalSize = data.bytesTotal != null ? formatBytes(data.bytesTotal) : null

  let title: string
  let color: number
  let description: string
  let fields: Array<{ name: string; value: string; inline?: boolean }> = []

  switch (event) {
    case "backup_completed":
      title = `✅ Backup Completed — ${data.jobName}`
      color = 0x22c55e // green
      description = `Backup of **${data.jobName}** finished successfully.`
      if (data.agentName) {
        fields.push({ name: "Agent", value: data.agentName, inline: true })
      }
      if (duration) fields.push({ name: "Duration", value: duration, inline: true })
      if (size) fields.push({ name: "New Data", value: size, inline: true })
      if (totalSize) fields.push({ name: "Total Size", value: totalSize, inline: true })
      if (data.filesNew != null) {
        fields.push({
          name: "Files",
          value: `${data.filesNew} new, ${data.filesChanged ?? 0} changed`,
          inline: true,
        })
      }
      if (data.snapshotId) {
        fields.push({ name: "Snapshot", value: `\`${data.snapshotId.slice(0, 8)}\``, inline: true })
      }
      break

    case "backup_failed":
      title = `❌ Backup Failed — ${data.jobName}`
      color = 0xef4444 // red
      description = `Backup of **${data.jobName}** failed.`
      if (data.agentName) {
        fields.push({ name: "Agent", value: data.agentName, inline: true })
      }
      if (duration) fields.push({ name: "Duration", value: duration, inline: true })
      if (data.error) {
        fields.push({ name: "Error", value: `\`\`\`\n${data.error.slice(0, 1000)}\n\`\`\`` })
      }
      break

    case "backup_started":
      title = `🔄 Backup Started — ${data.jobName}`
      color = 0x3b82f6 // blue
      description = `Backup of **${data.jobName}** has started.`
      if (data.agentName) {
        fields.push({ name: "Agent", value: data.agentName, inline: true })
      }
      break

    case "restore_completed":
      title = `⏪ Restore Completed — ${data.jobName}`
      color = 0xa855f7 // purple
      description = `Restore for **${data.jobName}** finished successfully.`
      if (data.agentName) {
        fields.push({ name: "Agent", value: data.agentName, inline: true })
      }
      if (duration) fields.push({ name: "Duration", value: duration, inline: true })
      break

    case "restore_failed":
      title = `⏪❌ Restore Failed — ${data.jobName}`
      color = 0xef4444 // red
      description = `Restore for **${data.jobName}** failed.`
      if (data.error) {
        fields.push({ name: "Error", value: `\`\`\`\n${data.error.slice(0, 1000)}\n\`\`\`` })
      }
      break
  }

  return {
    title,
    description,
    color,
    fields,
    footer: {
      text: "VoidBackups",
    },
    timestamp: new Date().toISOString(),
  }
}

// --- Telegram ---

async function sendTelegram(
  config: { botToken: string; chatId: string },
  event: BackupEvent,
  data: BackupEventData
): Promise<void> {
  const text = buildTelegramMessage(event, data)

  const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: "HTML",
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.description || `Telegram API error ${res.status}`)
  }
}

function buildTelegramMessage(event: BackupEvent, data: BackupEventData): string {
  const duration = data.durationMs != null ? formatDuration(data.durationMs) : null
  const size = data.bytesNew != null ? formatBytes(data.bytesNew) : null

  const lines: string[] = []

  switch (event) {
    case "backup_completed":
      lines.push(`<b>✅ Backup Completed</b>`)
      lines.push(`Job: <code>${data.jobName}</code>`)
      if (data.agentName) lines.push(`Agent: ${data.agentName}`)
      if (duration) lines.push(`Duration: ${duration}`)
      if (size) lines.push(`New data: ${size}`)
      break
    case "backup_failed":
      lines.push(`<b>❌ Backup Failed</b>`)
      lines.push(`Job: <code>${data.jobName}</code>`)
      if (data.agentName) lines.push(`Agent: ${data.agentName}`)
      if (data.error) lines.push(`Error: <code>${data.error.slice(0, 200)}</code>`)
      break
    case "backup_started":
      lines.push(`<b>🔄 Backup Started</b>`)
      lines.push(`Job: <code>${data.jobName}</code>`)
      break
    case "restore_completed":
      lines.push(`<b>⏪ Restore Completed</b>`)
      lines.push(`Job: <code>${data.jobName}</code>`)
      if (duration) lines.push(`Duration: ${duration}`)
      break
    case "restore_failed":
      lines.push(`<b>⏪❌ Restore Failed</b>`)
      lines.push(`Job: <code>${data.jobName}</code>`)
      if (data.error) lines.push(`Error: <code>${data.error.slice(0, 200)}</code>`)
      break
  }

  return lines.join("\n")
}

// --- Generic webhook ---

async function sendWebhook(
  config: { url: string },
  event: BackupEvent,
  data: BackupEventData
): Promise<void> {
  const res = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      jobName: data.jobName,
      agentName: data.agentName,
      status: data.status,
      durationMs: data.durationMs,
      bytesNew: data.bytesNew,
      bytesTotal: data.bytesTotal,
      filesNew: data.filesNew,
      filesChanged: data.filesChanged,
      error: data.error,
      snapshotId: data.snapshotId,
      timestamp: Date.now(),
    }),
  })

  if (!res.ok) {
    throw new Error(`Webhook returned ${res.status}`)
  }
}

// --- Helpers ---

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSec = seconds % 60
  return `${minutes}m ${remainingSec}s`
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
