/**
 * Jobs page — manage backup jobs with full create/edit UI.
 */

import { useEffect, useState } from "react"
import { Link } from "react-router"
import { Clock, Settings, Play, Plus, Trash2, Shield } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { timeAgo } from "@/lib/utils"

// Safely cast Record<string, unknown> fields
function r(obj: Record<string, unknown>, key: string, fallback: any = ""): any {
  return obj?.[key] ?? fallback
}

export function JobsPage() {
  const [jobs, setJobs] = useState<api.Job[]>([])
  const [agents, setAgents] = useState<api.Agent[]>([])
  const [sources, setSources] = useState<api.AgentSources[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteJob, setDeleteJob] = useState<api.Job | null>(null)
  const [creating, setCreating] = useState(false)

  // Form state
  const [formName, setFormName] = useState("")
  const [formAgentId, setFormAgentId] = useState("")
  const [formScheduleType, setFormScheduleType] = useState("manual")
  const [formCron, setCron] = useState("0 2 * * *")
  const [formIntervalHours, setIntervalHours] = useState("6")
  const [formSourceIds, setFormSourceIds] = useState<string[]>([])
  const [formRetainDaily, setRetainDaily] = useState("7")
  const [formRetainWeekly, setRetainWeekly] = useState("4")
  const [formRetainMonthly, setRetainMonthly] = useState("6")
  const [formRetainYearly, setRetainYearly] = useState("2")

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [jobsData, agentsData, sourcesData] = await Promise.all([
        api.listJobs(),
        api.listAgents(),
        api.listSources().catch(() => []),
      ])
      setJobs(jobsData)
      setAgents(agentsData)
      setSources(sourcesData)
      if (agentsData.length > 0 && !formAgentId) {
        setFormAgentId(agentsData[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  const agentSources = sources.find((s) => s.agent.id === formAgentId)?.sources || []

  async function handleCreate() {
    if (!formName.trim() || !formAgentId) return
    setCreating(true)
    try {
      await api.createJob({
        name: formName.trim(),
        agentId: formAgentId,
        sources: formSourceIds,
        schedule: {
          type: formScheduleType,
          ...(formScheduleType === "cron" ? { cron: formCron } : {}),
          ...(formScheduleType === "interval" ? { intervalMs: parseInt(formIntervalHours) * 3600000 } : {}),
        },
        retention: {
          keepDaily: parseInt(formRetainDaily) || 7,
          keepWeekly: parseInt(formRetainWeekly) || 4,
          keepMonthly: parseInt(formRetainMonthly) || 6,
          keepYearly: parseInt(formRetainYearly) || 2,
        },
        storage: { type: "local", path: "/var/backups/voidbackups" },
        encryption: { enabled: true },
      })
      setCreateOpen(false)
      resetForm()
      loadData()
    } finally {
      setCreating(false)
    }
  }

  async function handleTrigger(jobId: string) {
    await api.triggerJob(jobId)
    loadData()
  }

  async function handleToggle(job: api.Job) {
    await api.updateJob(job.id, { enabled: job.enabled ? 0 : 1 } as Partial<api.Job>)
    loadData()
  }

  async function handleDelete() {
    if (!deleteJob) return
    await api.deleteJob(deleteJob.id)
    setDeleteJob(null)
    loadData()
  }

  function resetForm() {
    setFormName("")
    setFormSourceIds([])
    setFormScheduleType("manual")
    setCron("0 2 * * *")
    setIntervalHours("6")
    setRetainDaily("7")
    setRetainWeekly("4")
    setRetainMonthly("6")
    setRetainYearly("2")
  }

  function toggleSource(id: string) {
    setFormSourceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
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
          <h1 className="text-2xl font-bold tracking-tight">Backup Jobs</h1>
          <p className="text-muted-foreground">
            Configure what to back up, when, and with what retention.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)} disabled={agents.length === 0}>
          <Plus className="h-4 w-4" />
          New Job
        </Button>
      </div>

      {agents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground mb-3">Connect an agent first before creating backup jobs.</p>
            <Link to="/agents">
              <Button variant="outline" size="sm">Go to Agents</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {jobs.length === 0 && agents.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium mb-2">No backup jobs configured</p>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Create your first backup job to start protecting your data.
            </p>
            <Button className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create First Job
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{job.name}</CardTitle>
                    <CardDescription>
                      {job.agent_name || "Unknown Agent"} •{" "}
                      {r(job.schedule, "type") === "cron"
                        ? `Cron: ${r(job.schedule, "cron")}`
                        : r(job.schedule, "type") === "interval"
                        ? `Every ${Math.round(Number(r(job.schedule, "intervalMs", 0)) / 3600000)}h`
                        : "Manual"}
                    </CardDescription>
                  </div>
                  <Switch
                    checked={!!job.enabled}
                    onCheckedChange={() => handleToggle(job)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Sources</p>
                      <p className="font-medium">{job.sources.length} items</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Run</p>
                      <p className="font-medium">
                        {job.last_run ? timeAgo(job.last_run) : "Never"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Retention</p>
                      <p className="font-medium">
                        {r(job.retention, "keepDaily", 7)}d / {r(job.retention, "keepWeekly", 4)}w / {r(job.retention, "keepMonthly", 6)}m
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Encryption</p>
                      <p className="font-medium">{r(job.encryption, "enabled") ? "AES-256" : "None"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleTrigger(job.id)}
                    >
                      <Play className="h-3 w-3" />
                      Run Now
                    </Button>
                    <Link to={`/jobs/${job.id}`}>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Settings className="h-3 w-3" />
                        Configure
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                      onClick={() => setDeleteJob(job)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Job Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm() }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Backup Job</DialogTitle>
            <DialogDescription>
              Configure what to back up, when to run it, and how long to keep backups.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label>Job Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Docker Volumes, Database Dumps"
                autoFocus
              />
            </div>

            {/* Agent */}
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={formAgentId} onValueChange={setFormAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sources */}
            <div className="space-y-2">
              <Label>Sources to Back Up</Label>
              {agentSources.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No sources discovered on this agent yet. Add sources on the Sources page first.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border p-2">
                  {agentSources.map((source) => (
                    <label
                      key={source.id}
                      className="flex items-center gap-2 rounded p-1.5 hover:bg-muted cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={formSourceIds.includes(source.id)}
                        onChange={() => toggleSource(source.id)}
                        className="rounded"
                      />
                      <span className="font-medium">{source.name}</span>
                      <Badge variant="outline" className="text-xs ml-auto">{source.type}</Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select value={formScheduleType} onValueChange={setFormScheduleType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Only</SelectItem>
                  <SelectItem value="interval">Interval</SelectItem>
                  <SelectItem value="cron">Cron Expression</SelectItem>
                </SelectContent>
              </Select>
              {formScheduleType === "cron" && (
                <Input
                  value={formCron}
                  onChange={(e) => setCron(e.target.value)}
                  placeholder="0 2 * * *"
                  className="font-mono text-sm"
                />
              )}
              {formScheduleType === "interval" && (
                <div className="flex items-center gap-2">
                  <Input
                    value={formIntervalHours}
                    onChange={(e) => setIntervalHours(e.target.value)}
                    type="number"
                    min="1"
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">hours between runs</span>
                </div>
              )}
            </div>

            {/* Retention */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Retention Policy
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Keep Daily</Label>
                  <Input
                    value={formRetainDaily}
                    onChange={(e) => setRetainDaily(e.target.value)}
                    type="number"
                    min="0"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Keep Weekly</Label>
                  <Input
                    value={formRetainWeekly}
                    onChange={(e) => setRetainWeekly(e.target.value)}
                    type="number"
                    min="0"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Keep Monthly</Label>
                  <Input
                    value={formRetainMonthly}
                    onChange={(e) => setRetainMonthly(e.target.value)}
                    type="number"
                    min="0"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Keep Yearly</Label>
                  <Input
                    value={formRetainYearly}
                    onChange={(e) => setRetainYearly(e.target.value)}
                    type="number"
                    min="0"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !formName.trim() || !formAgentId}>
              {creating ? "Creating..." : "Create Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteJob} onOpenChange={(open) => { if (!open) setDeleteJob(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteJob?.name}</strong>? This will not delete existing backups or snapshots.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
