/**
 * Settings page — system configuration and information.
 */

import { Shield, Server, Database, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          System configuration and information.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Authentication</CardTitle>
            </div>
            <CardDescription>Passkey-only authentication</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Auth Method</span>
                <Badge variant="secondary">WebAuthn Passkey</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Session Duration</span>
                <span className="text-sm text-muted-foreground">30 days</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Single User Mode</span>
                <Badge variant="secondary">Enabled</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Storage</CardTitle>
            </div>
            <CardDescription>Backup storage configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Backup Engine</span>
                <Badge variant="secondary">restic</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Encryption</span>
                <Badge variant="secondary">AES-256</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Deduplication</span>
                <Badge variant="secondary">Content-defined chunking</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <CardTitle>System</CardTitle>
            </div>
            <CardDescription>Server information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Version</span>
                <span className="text-sm text-muted-foreground">0.1.0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Runtime</span>
                <span className="text-sm text-muted-foreground">Bun + Hono</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Database</span>
                <span className="text-sm text-muted-foreground">SQLite (WAL mode)</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm">Network</span>
                <Badge variant="secondary">Tailscale only</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-muted-foreground" />
              <CardTitle>About</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              VoidBackups is a private backup management platform for VoidInfrastructure.
              It provides encrypted, deduplicated backups across multiple servers using restic,
              with passkey-only authentication and Tailscale-only access.
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Part of the VoidSuite ecosystem. Source code available at{" "}
              <a
                href="https://github.com/voidsuite/voidbackups"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                github.com/voidsuite/voidbackups
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
