/**
 * Agents page — manage backup agents on each server.
 */

import { useEffect, useState } from "react"
import {
  Server,
  Trash2,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Wifi,
  WifiOff,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import * as api from "@/lib/api"
import { timeAgo } from "@/lib/utils"

export function AgentsPage() {
  const [agents, setAgents] = useState<api.Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [scriptDialog, setScriptDialog] = useState<string | null>(null)
  const [installScript, setInstallScript] = useState<string | null>(null)
  const [scriptCopied, setScriptCopied] = useState(false)

  useEffect(() => {
    loadAgents()
  }, [])

  async function loadAgents() {
    setLoading(true)
    try {
      setAgents(await api.listAgents())
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    await api.deleteAgent(deleteId)
    setDeleteId(null)
    loadAgents()
  }

  async function handleGetScript(agentId: string) {
    setScriptDialog(agentId)
    try {
      const result = await api.getAgentInstallScript(agentId)
      setInstallScript(result.script)
    } catch {
      setInstallScript("# Error loading install script")
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">
            Manage backup agents running on your servers.
          </p>
        </div>
        <Button onClick={loadAgents} variant="outline" size="sm" className="gap-1">
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Server className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium mb-2">No agents connected</p>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Install the VoidBackups agent on your servers to start backing up.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {agent.status === "online" ? (
                      <Wifi className="h-5 w-5 text-green-500" />
                    ) : (
                      <WifiOff className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <CardTitle className="text-lg">{agent.name}</CardTitle>
                      <CardDescription>{agent.hostname}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={agent.status === "online" ? "default" : "secondary"}>
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Platform</p>
                      <p className="font-medium">{agent.platform || "Unknown"}/{agent.arch || "?"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Restic</p>
                      <p className="font-medium">{agent.restic_version || "Unknown"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tailscale IP</p>
                      <p className="font-mono text-xs">{agent.tailscale_ip || "Not set"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last seen</p>
                      <p className="font-medium">
                        {agent.last_seen ? timeAgo(agent.last_seen) : "Never"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleGetScript(agent.id)}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Install Script
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(agent.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Install Script Dialog */}
      <Dialog open={!!scriptDialog} onOpenChange={() => { setScriptDialog(null); setInstallScript(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agent Install Script</DialogTitle>
            <DialogDescription>
              Run this script on the server to install and register the VoidBackups agent.
            </DialogDescription>
          </DialogHeader>
          {installScript && (
            <div className="relative">
              <pre className="rounded-lg bg-background border p-4 text-xs font-mono overflow-x-auto max-h-96">
                {installScript}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 gap-1"
                onClick={() => {
                  navigator.clipboard.writeText(installScript)
                  setScriptCopied(true)
                  setTimeout(() => setScriptCopied(false), 2000)
                }}
              >
                {scriptCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copy
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Agent</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the agent from VoidBackups. The agent will stop receiving backup tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
