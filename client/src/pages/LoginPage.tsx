/**
 * Login page — passkey authentication.
 * Simple: click the button, authenticate with your passkey.
 */

import { useState } from "react"
import { Loader2, Fingerprint } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { VoidBackupsLogo } from "@/components/layout/VoidBackupsLogo"
import { useAuth } from "@/contexts/auth"

export function LoginPage() {
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      await login()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <VoidBackupsLogo size="lg" tagline className="justify-center" />
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                size="lg"
                className="w-full gap-2"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Fingerprint className="h-4 w-4" />
                )}
                Sign in with Passkey
              </Button>

              <p className="text-xs text-muted-foreground">
                Use your device's biometric or security key to authenticate
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
