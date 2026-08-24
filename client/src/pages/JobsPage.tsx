/**
 * Jobs page — manage backup jobs.
 */

import { useEffect, useState } from "react"
import { Link } from "react-router"
import { Clock, Settings, Play } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import * as api from "@/lib/api"
import { timeAgo } from "@/lib/utils"

export function JobsPage() {
  const [jobs, setJobs] = useState<api.Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadJobs()
  }, [])

  async function loadJobs() {
    setLoading(true)
    try {
      setJobs(await api.listJobs())
    } finally {
      setLoading(false)
    }
  }

  async function handleTrigger(jobId: string) {
    await api.triggerJob(jobId)
    loadJobs()
  }

  async function handleToggle(job: api.Job) {
    await api.updateJob(job.id, { enabled: job.enabled ? 0 : 1 } as Partial<api.Job>)
    loadJobs()
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
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium mb-2">No backup jobs configured</p>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Create your first backup job to start protecting your data.
            </p>
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
                      {job.schedule.type === "cron" ? String(job.schedule.cron) : String(job.schedule.type)}
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
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
