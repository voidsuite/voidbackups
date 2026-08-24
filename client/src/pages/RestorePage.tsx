/**
 * Restore page — browse snapshots and restore from backups.
 */

import { useEffect, useState } from "react"
import {
  RotateCcw,
  Clock,
  Check,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import * as api from "@/lib/api"
import { formatBytes, formatDuration, formatDateTime } from "@/lib/utils"

interface Snapshot {
  id: string
  runId: string
  time: number
  duration: number | null
  bytes: number
  files: number
}

export function RestorePage() {
  const [jobs, setJobs] = useState<api.Job[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState("/tmp/voidbackups-restore")
  const [restoreDialog, setRestoreDialog] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreComplete, setRestoreComplete] = useState(false)

  useEffect(() => {
    loadJobs()
  }, [])

  async function loadJobs() {
    setLoading(true)
    try {
      const data = await api.listJobs()
      setJobs(data)
    } finally {
      setLoading(false)
    }
  }

  async function loadSnapshots(jobId: string) {
    setSelectedJobId(jobId)
    setLoadingSnapshots(true)
    setSnapshots([])
    setSelectedSnapshot(null)
    try {
      const response = await fetch(`/api/restore/snapshots/${jobId}`, {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setSnapshots(data.snapshots || [])
      }
    } finally {
      setLoadingSnapshots(false)
    }
  }

  async function handleRestore() {
    if (!selectedSnapshot || !selectedJobId) return

    setRestoring(true)
    try {
      const response = await fetch("/api/restore/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          jobId: selectedJobId,
          snapshotId: selectedSnapshot.id,
          target: restoreTarget,
        }),
      })
      if (response.ok) {
        setRestoreComplete(true)
      }
    } finally {
      setRestoring(false)
    }
  }

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Restore</h1>
        <p className="text-muted-foreground">
          Browse backup snapshots and restore your data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Backup Job</CardTitle>
          <CardDescription>Choose which backup job to restore from</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No backup jobs configured yet.</p>
          ) : (
            <Select value={selectedJobId || ""} onValueChange={loadSnapshots}>
              <SelectTrigger>
                <SelectValue placeholder="Select a backup job..." />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.name} ({job.agent_name || "Unknown Agent"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedJobId && (
        <Card>
          <CardHeader>
            <CardTitle>Available Snapshots</CardTitle>
            <CardDescription>Select a snapshot to restore from</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSnapshots ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : snapshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Clock className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No snapshots found for this job</p>
              </div>
            ) : (
              <div className="space-y-2">
                {snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedSnapshot?.id === snap.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedSnapshot(snap)}
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium font-mono">{snap.id.slice(0, 12)}...</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(snap.time)}
                          {snap.duration && ` • ${formatDuration(snap.duration)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatBytes(snap.bytes)}</span>
                      <span>{snap.files} files</span>
                      {selectedSnapshot?.id === snap.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedSnapshot && (
        <Card>
          <CardHeader>
            <CardTitle>Restore Configuration</CardTitle>
            <CardDescription>Configure where to restore the data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target">Restore Target Directory</Label>
              <Input
                id="target"
                value={restoreTarget}
                onChange={(e) => setRestoreTarget(e.target.value)}
                placeholder="/tmp/voidbackups-restore"
              />
              <p className="text-xs text-muted-foreground">
                Files will be restored to this directory on the agent server
              </p>
            </div>

            <Separator />

            <div className="flex justify-end">
              <Button onClick={() => setRestoreDialog(true)} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Restore Snapshot
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={restoreDialog} onOpenChange={setRestoreDialog}>
        <DialogContent>
          {restoreComplete ? (
            <>
              <DialogHeader>
                <DialogTitle>Restore Queued</DialogTitle>
                <DialogDescription>
                  The restore operation has been queued. The agent will execute it shortly.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end">
                <Button onClick={() => { setRestoreDialog(false); setRestoreComplete(false) }}>
                  Done
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Confirm Restore</DialogTitle>
                <DialogDescription>
                  This will restore files from snapshot{" "}
                  <code className="font-mono text-xs">{selectedSnapshot?.id.slice(0, 12)}...</code>
                  to <code className="font-mono text-xs">{restoreTarget}</code>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRestoreDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleRestore} disabled={restoring} className="gap-2">
                  {restoring ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Restore
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
