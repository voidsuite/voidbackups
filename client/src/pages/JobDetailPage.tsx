/**
 * Job detail page — view and edit a backup job, see run history.
 */

import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import {
  ArrowLeft,
  Play,
  Trash2,
  Save,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
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
import { formatDuration, timeAgo } from "@/lib/utils"

// Safely cast Record<string, unknown> fields
function r(obj: Record<string, unknown>, key: string, fallback: any = ""): any {
  return obj?.[key] ?? fallback
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [job, setJob] = useState<(api.Job & { sources_detail: any[]; recent_runs: any[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Editable fields
  const [name, setName] = useState("")
  const [scheduleType, setScheduleType] = useState("manual")
  const [cron, setCron] = useState("")
  const [intervalHours, setIntervalHours] = useState("6")
  const [retainDaily, setRetainDaily] = useState("7")
  const [retainWeekly, setRetainWeekly] = useState("4")
  const [retainMonthly, setRetainMonthly] = useState("6")
  const [retainYearly, setRetainYearly] = useState("2")
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])

  useEffect(() => {
    if (id) loadJob(id)
  }, [id])

  async function loadJob(jobId: string) {
    setLoading(true)
    try {
      const data = await api.getJob(jobId)
      setJob(data)
      setName(data.name)
      setScheduleType(r(data.schedule, "type", "manual"))
      setCron(r(data.schedule, "cron", "0 2 * * *"))
      setIntervalHours(String(Math.round(Number(r(data.schedule, "intervalMs", 0)) / 3600000) || 6))
      setRetainDaily(String(r(data.retention, "keepDaily", 7)))
      setRetainWeekly(String(r(data.retention, "keepWeekly", 4)))
      setRetainMonthly(String(r(data.retention, "keepMonthly", 6)))
      setRetainYearly(String(r(data.retention, "keepYearly", 2)))
      setSelectedSourceIds(data.sources || [])
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!id) return
    setSaving(true)
    try {
      await api.updateJob(id, {
        name,
        schedule: {
          type: scheduleType,
          ...(scheduleType === "cron" ? { cron } : {}),
          ...(scheduleType === "interval" ? { intervalMs: parseInt(intervalHours) * 3600000 } : {}),
        },
        sources: selectedSourceIds,
        retention: {
          keepDaily: parseInt(retainDaily) || 7,
          keepWeekly: parseInt(retainWeekly) || 4,
          keepMonthly: parseInt(retainMonthly) || 6,
          keepYearly: parseInt(retainYearly) || 2,
        },
      } as Partial<api.Job>)
      if (id) loadJob(id)
    } finally {
      setSaving(false)
    }
  }

  async function handleRun() {
    if (!id) return
    await api.triggerJob(id)
    if (id) loadJob(id)
  }

  async function handleDelete() {
    if (!id) return
    await api.deleteJob(id)
    navigate("/jobs")
  }

  function toggleSource(sourceId: string) {
    setSelectedSourceIds((prev) =>
      prev.includes(sourceId) ? prev.filter((s) => s !== sourceId) : [...prev, sourceId]
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="space-y-6">
        <p className="text-muted-foreground">Job not found.</p>
        <Button variant="outline" onClick={() => navigate("/jobs")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Jobs
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/jobs")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{job.name}</h1>
            <p className="text-muted-foreground">
              {job.agent_name || "Unknown Agent"} •{" "}
              {r(job.schedule, "type") === "cron"
                ? `Cron: ${r(job.schedule, "cron")}`
                : r(job.schedule, "type") === "interval"
                ? `Every ${Math.round(Number(r(job.schedule, "intervalMs", 0)) / 3600000)}h`
                : "Manual"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!job.enabled}
            onCheckedChange={async () => {
              await api.updateJob(job.id, { enabled: job.enabled ? 0 : 1 } as Partial<api.Job>)
              loadJob(job.id)
            }}
          />
          <Button variant="outline" className="gap-1" onClick={handleRun}>
            <Play className="h-3 w-3" />
            Run Now
          </Button>
          <Button variant="outline" className="gap-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteConfirm(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Configuration */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Job Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Schedule</Label>
                <Select value={scheduleType} onValueChange={setScheduleType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Only</SelectItem>
                    <SelectItem value="interval">Interval</SelectItem>
                    <SelectItem value="cron">Cron Expression</SelectItem>
                  </SelectContent>
                </Select>
                {scheduleType === "cron" && (
                  <Input value={cron} onChange={(e) => setCron(e.target.value)} className="font-mono text-sm" />
                )}
                {scheduleType === "interval" && (
                  <div className="flex items-center gap-2">
                    <Input
                      value={intervalHours}
                      onChange={(e) => setIntervalHours(e.target.value)}
                      type="number"
                      min="1"
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">hours</span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Sources ({selectedSourceIds.length} selected)</Label>
                {job.sources_detail.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No sources assigned.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border p-2">
                    {job.sources_detail.map((source: any) => (
                      <label
                        key={source.id}
                        className="flex items-center gap-2 rounded p-1.5 hover:bg-muted cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSourceIds.includes(source.id)}
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

              <Separator />

              <div className="space-y-2">
                <Label>Retention Policy</Label>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Daily</Label>
                    <Input value={retainDaily} onChange={(e) => setRetainDaily(e.target.value)} type="number" min="0" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Weekly</Label>
                    <Input value={retainWeekly} onChange={(e) => setRetainWeekly(e.target.value)} type="number" min="0" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Monthly</Label>
                    <Input value={retainMonthly} onChange={(e) => setRetainMonthly(e.target.value)} type="number" min="0" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Yearly</Label>
                    <Input value={retainYearly} onChange={(e) => setRetainYearly(e.target.value)} type="number" min="0" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Run History */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Runs</CardTitle>
            </CardHeader>
            <CardContent>
              {job.recent_runs.length === 0 ? (
                <div className="py-6 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No runs yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {job.recent_runs.slice(0, 10).map((run: any) => (
                    <div key={run.id} className="flex items-center justify-between rounded border p-2 text-sm">
                      <div className="flex items-center gap-2">
                        {run.status === "success" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : run.status === "failed" ? (
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                        ) : run.status === "running" ? (
                          <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{run.status}</p>
                          <p className="text-xs text-muted-foreground">
                            {run.triggered_by}
                            {run.duration_ms && ` • ${formatDuration(run.duration_ms)}`}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{timeAgo(run.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Backup Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{job.name}</strong>? Existing backups and snapshots are preserved.
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
