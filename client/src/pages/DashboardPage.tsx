/**
 * Dashboard page — overview of agents, backups, and storage.
 */

import { useEffect, useState } from "react"
import { Link } from "react-router"
import {
  Server,
  HardDrive,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Activity,
  Shield,
  Plus,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/contexts/auth"
import * as api from "@/lib/api"
import { formatBytes, formatDuration, timeAgo } from "@/lib/utils"

export function DashboardPage() {
  const { user } = useAuth()
  const [agents, setAgents] = useState<api.Agent[]>([])
  const [stats, setStats] = useState<api.RunStats | null>(null)
  const [recentRuns, setRecentRuns] = useState<api.Run[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [agentsData, statsData, runsData] = await Promise.all([
          api.listAgents(),
          api.getRunStats().catch(() => null),
          api.listRuns({ limit: 5 }).catch(() => ({ runs: [], pagination: { total: 0 } })),
        ])
        setAgents(agentsData)
        setStats(statsData)
        setRecentRuns(runsData.runs)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const onlineAgents = agents.filter((a) => a.status === "online")
  const offlineAgents = agents.filter((a) => a.status === "offline")

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {user?.name || "Admin"}
        </h1>
        <p className="text-muted-foreground">
          Here's an overview of your backup infrastructure.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Agents</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agents.length}</div>
            <p className="text-xs text-muted-foreground">
              {onlineAgents.length} online, {offlineAgents.length} offline
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Backups</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRuns ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.successRate ?? 0}% success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Data Backed Up</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(stats?.totalBytesBackedUp ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Last 24h: {stats?.runsLast24h ?? 0} runs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(stats?.avgDurationMs ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per backup run
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Agents</CardTitle>
              <CardDescription>Your connected backup servers</CardDescription>
            </div>
            <Link to="/agents">
              <Button variant="outline" size="sm" className="gap-1">
                View All
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Server className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No agents connected yet</p>
                <Link to="/agents">
                  <Button size="sm" className="gap-1">
                    <Plus className="h-3 w-3" />
                    Add Agent
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {agents.slice(0, 5).map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          agent.status === "online" ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {agent.hostname}
                          {agent.tailscale_ip && ` • ${agent.tailscale_ip}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant={agent.status === "online" ? "default" : "secondary"}>
                      {agent.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest backup runs</CardDescription>
            </div>
            <Link to="/history">
              <Button variant="outline" size="sm" className="gap-1">
                View All
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentRuns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No backup runs yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {run.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : run.status === "failed" ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{run.job_name || "Unknown Job"}</p>
                        <p className="text-xs text-muted-foreground">
                          {run.agent_name || "Unknown Agent"}
                          {run.duration_ms && ` • ${formatDuration(run.duration_ms)}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          run.status === "success"
                            ? "default"
                            : run.status === "failed"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {run.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {timeAgo(run.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
