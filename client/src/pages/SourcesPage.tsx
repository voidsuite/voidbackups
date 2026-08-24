/**
 * Sources page — view backup sources across agents.
 */

import { useEffect, useState } from "react"
import { HardDrive, Database, FolderOpen } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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

export function SourcesPage() {
  const [agentSources, setAgentSources] = useState<api.AgentSources[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSources()
  }, [])

  async function loadSources() {
    setLoading(true)
    try {
      setAgentSources(await api.listSources())
    } finally {
      setLoading(false)
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

  const totalSources = agentSources.reduce((sum, as) => sum + as.sources.length, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Backup Sources</h1>
        <p className="text-muted-foreground">
          {totalSources} source{totalSources !== 1 ? "s" : ""} configured across {agentSources.length} agent{agentSources.length !== 1 ? "s" : ""}.
        </p>
      </div>

      {agentSources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <HardDrive className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium mb-2">No sources discovered</p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Connect an agent first, then it will auto-discover backup sources.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {agentSources.map((as) => (
            <Card key={as.agent.id}>
              <CardHeader>
                <CardTitle className="text-lg">{as.agent.name}</CardTitle>
                <CardDescription>{as.sources.length} source(s)</CardDescription>
              </CardHeader>
              <CardContent>
                {as.sources.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No sources discovered on this agent yet.
                  </p>
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
                              {source.type}
                            </Badge>
                            {source.discovered ? (
                              <Badge variant="secondary" className="text-xs">Auto</Badge>
                            ) : null}
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
    </div>
  )
}
