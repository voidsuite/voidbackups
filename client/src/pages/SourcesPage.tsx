/**
 * Sources page — view and manage backup sources across agents.
 */

import { useEffect, useState } from "react"
import { HardDrive, Database, FolderOpen, Plus, Trash2, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

const sourceIcons: Record<string, typeof HardDrive> = {
  docker_volume: FolderOpen,
  docker_container: FolderOpen,
  sqlite: Database,
  postgresql: Database,
  mysql: Database,
  redis: Database,
  path: HardDrive,
}

const sourceTypes = [
  { value: "path", label: "File/Directory Path" },
  { value: "docker_volume", label: "Docker Volume" },
  { value: "docker_container", label: "Docker Container" },
  { value: "sqlite", label: "SQLite Database" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "redis", label: "Redis" },
]

export function SourcesPage() {
  const [agentSources, setAgentSources] = useState<api.AgentSources[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteSource, setDeleteSource] = useState<{ id: string; name: string } | null>(null)
  const [creating, setCreating] = useState(false)

  // Form state
  const [formAgentId, setFormAgentId] = useState("")
  const [formType, setFormType] = useState("path")
  const [formName, setFormName] = useState("")
  const [formPath, setFormPath] = useState("")

  useEffect(() => {
    loadSources()
  }, [])

  async function loadSources() {
    setLoading(true)
    try {
      const data = await api.listSources()
      setAgentSources(data)
      if (data.length > 0 && !formAgentId) {
        setFormAgentId(data[0].agent.id)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!formName.trim() || !formPath.trim() || !formAgentId) return
    setCreating(true)
    try {
      await api.createSource({
        agentId: formAgentId,
        type: formType,
        name: formName.trim(),
        path: formPath.trim(),
        metadata: {},
      })
      setAddOpen(false)
      setFormName("")
      setFormPath("")
      loadSources()
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete() {
    if (!deleteSource) return
    await api.deleteSource(deleteSource.id)
    setDeleteSource(null)
    loadSources()
  }

  async function handleDiscover(agentId: string) {
    await api.discoverSources(agentId)
    // Give agent a moment, then refresh
    setTimeout(loadSources, 3000)
  }

  const totalSources = agentSources.reduce((sum, as) => sum + as.sources.length, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Backup Sources</h1>
          <p className="text-muted-foreground">
            {totalSources} source{totalSources !== 1 ? "s" : ""} across {agentSources.length} agent{agentSources.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setAddOpen(true)} disabled={agentSources.length === 0}>
          <Plus className="h-4 w-4" />
          Add Source
        </Button>
      </div>

      {agentSources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <HardDrive className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium mb-2">No agents connected</p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Connect an agent first, then add backup sources manually or let the agent auto-discover them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {agentSources.map((as) => (
            <Card key={as.agent.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{as.agent.name}</CardTitle>
                    <CardDescription>{as.sources.length} source(s)</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => handleDiscover(as.agent.id)}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Discover
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {as.sources.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-sm text-muted-foreground mb-3">
                      No sources on this agent yet.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => { setFormAgentId(as.agent.id); setAddOpen(true) }}
                    >
                      <Plus className="h-3 w-3" />
                      Add Source
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {as.sources.map((source) => {
                      const Icon = sourceIcons[source.type] || HardDrive
                      return (
                        <div
                          key={source.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{source.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{source.path}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {source.type.replace("_", " ")}
                            </Badge>
                            {source.discovered ? (
                              <Badge variant="secondary" className="text-xs">Auto</Badge>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteSource({ id: source.id, name: source.name })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Source Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setFormName(""); setFormPath("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Backup Source</DialogTitle>
            <DialogDescription>
              Manually add a file, directory, database, or Docker resource to back up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={formAgentId} onValueChange={setFormAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {agentSources.map((as) => (
                    <SelectItem key={as.agent.id} value={as.agent.id}>
                      {as.agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sourceTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., PostgreSQL Data, Docker Volumes"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Path</Label>
              <Input
                value={formPath}
                onChange={(e) => setFormPath(e.target.value)}
                placeholder={
                  formType === "docker_volume" ? "/var/lib/docker/volumes/myvolume/_data"
                  : formType === "sqlite" ? "/var/lib/app/data.db"
                  : "/var/lib/myapp/data"
                }
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Absolute path on the agent server
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !formName.trim() || !formPath.trim() || !formAgentId}>
              {creating ? "Adding..." : "Add Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteSource} onOpenChange={(open) => { if (!open) setDeleteSource(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Source</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteSource?.name}</strong> from backup sources? This won't delete the actual data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
