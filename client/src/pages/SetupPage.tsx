/**
 * Setup page — first-time setup wizard.
 */

import { useState } from "react"
import { useNavigate } from "react-router"
import { Loader2, ShieldCheck, HardDrive, KeyRound, Server, Check, ArrowRight, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VoidBackupsLogo } from "@/components/layout/VoidBackupsLogo"
import { useAuth } from "@/contexts/auth"
import * as api from "@/lib/api"

type Step = "welcome" | "account" | "storage" | "encryption" | "agent" | "done"

export function SetupPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [step, setStep] = useState<Step>("welcome")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [storagePath, setStoragePath] = useState("/var/backups/voidbackups")
  const [encryptionPassword, setEncryptionPassword] = useState<string | null>(null)
  const [scriptCopied, setScriptCopied] = useState(false)

  const handleCreateAccount = async () => {
    if (!name.trim()) {
      setError("Please enter your name")
      return
    }
    setLoading(true)
    setError(null)
    try {
      await register(name.trim())
      setStep("storage")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleConfigureStorage = async () => {
    setLoading(true)
    setError(null)
    try {
      await api.configureStorage({ path: storagePath })
      setStep("encryption")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateEncryption = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.generateEncryptionKey()
      setEncryptionPassword(result.password)
      setStep("agent")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    try {
      await api.completeWizard()
    } catch {
      // ignore
    }
    navigate("/")
  }

  const steps: { key: Step; icon: typeof ShieldCheck }[] = [
    { key: "welcome", icon: ShieldCheck },
    { key: "account", icon: ShieldCheck },
    { key: "storage", icon: HardDrive },
    { key: "encryption", icon: KeyRound },
    { key: "agent", icon: Server },
    { key: "done", icon: Check },
  ]

  const currentStepIndex = steps.findIndex((s) => s.key === step)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 bg-background">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex justify-center">
          <VoidBackupsLogo size="lg" tagline />
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  i < currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : i === currentStepIndex
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < currentStepIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`h-px w-8 ${i < currentStepIndex ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {step === "welcome" && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Welcome to VoidBackups</CardTitle>
              <CardDescription>
                Your private infrastructure backup manager. Let's get you set up in just a few steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-lg border p-4 text-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Passkey-only authentication</p>
                    <p className="text-muted-foreground">No passwords, no OAuth — just your device's passkey</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <HardDrive className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Encrypted backups with restic</p>
                    <p className="text-muted-foreground">Deduplicated, encrypted, and stored securely</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Server className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Multi-server support</p>
                    <p className="text-muted-foreground">Manage backups across all your servers via Tailscale</p>
                  </div>
                </div>
              </div>
              <Button className="w-full gap-2" onClick={() => setStep("account")}>
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "account" && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Create Admin Account</CardTitle>
              <CardDescription>
                Register your passkey. This will be the only way to access VoidBackups.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Foxy"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateAccount()}
                  autoFocus
                />
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleCreateAccount}
                disabled={loading || !name.trim()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Create Passkey
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Your browser will prompt you to create a passkey (biometric or security key)
              </p>
            </CardContent>
          </Card>
        )}

        {step === "storage" && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Configure Storage</CardTitle>
              <CardDescription>
                Where should backups be stored on this server?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="storagePath">Backup Storage Path</Label>
                <Input
                  id="storagePath"
                  value={storagePath}
                  onChange={(e) => setStoragePath(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Restic repositories will be created inside this directory
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep("account")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleConfigureStorage}
                  disabled={loading || !storagePath.trim()}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "encryption" && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Encryption Key</CardTitle>
              <CardDescription>
                All backups are encrypted at rest. Generate your encryption key.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {encryptionPassword ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
                      ⚠️ Save this encryption password
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      This password encrypts your backups. If you lose it, you cannot restore your data.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-background px-3 py-2 text-sm font-mono break-all">
                        {encryptionPassword}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(encryptionPassword)
                          setScriptCopied(true)
                          setTimeout(() => setScriptCopied(false), 2000)
                        }}
                      >
                        {scriptCopied ? <Check className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <Button className="w-full gap-2" onClick={() => setStep("agent")}>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Click below to generate a unique encryption key for your restic repositories.
                  </p>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setStep("storage")}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      className="flex-1 gap-2"
                      onClick={handleGenerateEncryption}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      Generate Key
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === "agent" && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Install Agent</CardTitle>
              <CardDescription>
                Install the backup agent on your server to start backing up.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4 text-sm space-y-2">
                <p className="font-medium">Quick install (run on your server):</p>
                <code className="block rounded bg-background p-3 text-xs font-mono break-all">
                  curl -fsSL https://your-server:3010/api/install.sh | bash
                </code>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                The agent will register itself and start polling for backup tasks.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep("encryption")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button className="flex-1 gap-2" onClick={handleComplete}>
                  <Check className="h-4 w-4" />
                  Finish Setup
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
