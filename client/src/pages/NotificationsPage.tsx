/**
 * Notifications page — configure notification channels.
 */

import { useEffect, useState } from "react"
import { Bell, Trash2, Send } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import * as api from "@/lib/api"

export function NotificationsPage() {
  const [channels, setChannels] = useState<api.NotificationChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialog, setAddDialog] = useState(false)
  const [newType, setNewType] = useState("webhook")
  const [newName, setNewName] = useState("")
  const [newBotToken, setNewBotToken] = useState("")
  const [newChatId, setNewChatId] = useState("")
  const [newWebhookUrl, setNewWebhookUrl] = useState("")
  const [testing, setTesting] = useState<string | null>(null)

  useEffect(() => {
    loadChannels()
  }, [])

  async function loadChannels() {
    setLoading(true)
    try {
      setChannels(await api.listNotifications())
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    let config: Record<string, unknown> = {}
    if (newType === "discord") {
      config = { webhookUrl: newWebhookUrl }
    } else if (newType === "webhook") {
      config = { url: newWebhookUrl }
    } else if (newType === "telegram") {
      config = { botToken: newBotToken, chatId: newChatId }
    }

    await api.createNotification({
      type: newType,
      name: newName,
      config,
      events: ["backup_failed", "backup_completed"],
    })
    setAddDialog(false)
    setNewName("")
    setNewWebhookUrl("")
    setNewBotToken("")
    setNewChatId("")
    loadChannels()
  }

  async function handleDelete(id: string) {
    await api.deleteNotification(id)
    loadChannels()
  }

  async function handleTest(id: string) {
    setTesting(id)
    try {
      await api.testNotification(id)
    } catch {
      // ignore
    }
    setTimeout(() => setTesting(null), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            Get notified about backup events.
          </p>
        </div>
        <Button onClick={() => setAddDialog(true)}>Add Channel</Button>
      </div>

      {channels.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium mb-2">No notification channels</p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Add a Discord, Telegram bot, or webhook to receive backup notifications.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => (
            <Card key={ch.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{ch.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{ch.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={ch.enabled ? "default" : "secondary"}>
                    {ch.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTest(ch.id)}
                    disabled={testing === ch.id}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    {testing === ch.id ? "Sent!" : "Test"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(ch.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Notification Channel</DialogTitle>
            <DialogDescription>
              Choose a notification channel type and configure it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Channel Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Telegram Alerts"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discord">Discord</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(newType === "discord" || newType === "webhook") && (
              <div className="space-y-2">
                <Label>{newType === "discord" ? "Discord Webhook URL" : "Webhook URL"}</Label>
                <Input
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder={newType === "discord" ? "https://discord.com/api/webhooks/..." : "https://hooks.example.com/..."}
                />
                {newType === "discord" && (
                  <p className="text-xs text-muted-foreground">
                    Server Settings → Integrations → Webhooks → Create Webhook
                  </p>
                )}
              </div>
            )}
            {newType === "telegram" && (
              <>
                <div className="space-y-2">
                  <Label>Bot Token</Label>
                  <Input
                    value={newBotToken}
                    onChange={(e) => setNewBotToken(e.target.value)}
                    placeholder="123456789:ABC..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Chat ID</Label>
                  <Input
                    value={newChatId}
                    onChange={(e) => setNewChatId(e.target.value)}
                    placeholder="-100123456789"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!newName}>Add Channel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
