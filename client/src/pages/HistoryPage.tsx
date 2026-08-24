/**
 * History page — view backup run history with logs.
 */

import { useEffect, useState } from "react"
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
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
import { ScrollArea } from "@/components/ui/scroll-area"
import * as api from "@/lib/api"
import { formatBytes, formatDuration, formatDateTime, timeAgo } from "@/lib/utils"

export function HistoryPage() {
  const [runs, setRuns] = useState<api.Run[]>([])
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [logDialog, setLogDialog] = useState<string | null>(null)
  const [logs, setLogs] = useState<string>("")

  useEffect(() => {
    loadRuns(1)
  }, [])

  async function loadRuns(page: number) {
    setLoading(true)
    try {
      const result = await api.listRuns({ page, limit: 20 })
      setRuns(result.runs)
      setPagination(result.pagination)
    } finally {
      setLoading(false)
    }
  }

  async function handleViewLogs(runId: string) {
    setLogDialog(runId)
    try {
      const result = await api.getRunLogs(runId)
      setLogs(result.logs)
    } catch {
      setLogs("Failed to load logs")
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Backup History</h1>
        <p className="text-muted-foreground">
          {pagination.total} total run{pagination.total !== 1 ? "s" : ""}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium">No backup runs yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/50">
                  <div className="flex items-center gap-4">
                    {statusIcon(run.status)}
                    <div>
                      <p className="text-sm font-medium">{run.job_name || "Unknown Job"}</p>
                      <p className="text-xs text-muted-foreground">
                        {run.agent_name || "Unknown Agent"} • {run.triggered_by}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    {run.bytes_new > 0 && (
                      <span className="text-muted-foreground">{formatBytes(run.bytes_new)} new</span>
                    )}
                    {run.duration_ms && (
                      <span className="text-muted-foreground">{formatDuration(run.duration_ms)}</span>
                    )}
                    <span className="text-muted-foreground">{timeAgo(run.created_at)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleViewLogs(run.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.pages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => loadRuns(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.pages}
              onClick={() => loadRuns(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Log viewer dialog */}
      <Dialog open={!!logDialog} onOpenChange={() => { setLogDialog(null); setLogs("") }}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Backup Logs</DialogTitle>
            <DialogDescription>Run ID: {logDialog}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[50vh]">
            <pre className="text-xs font-mono p-4 bg-background rounded-lg whitespace-pre-wrap break-all">
              {logs || "No logs available"}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
