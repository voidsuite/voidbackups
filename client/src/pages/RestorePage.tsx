/**
 * Restore page — restore data from backup snapshots.
 */

import { RotateCcw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function RestorePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Restore</h1>
        <p className="text-muted-foreground">
          Restore data from backup snapshots.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <RotateCcw className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium mb-2">Restore coming soon</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            The restore interface will allow you to browse snapshots and selectively
            restore files from your backups. This feature is under development.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
