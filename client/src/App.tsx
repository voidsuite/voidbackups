/**
 * App — route shell for VoidBackups.
 *
 * Gate: while auth is loading show a splash; if setup is needed show setup wizard;
 * until the user is signed in show the login page.
 */

import { Navigate, Route, Routes } from "react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth"
import { AppShell } from "@/components/layout/AppShell"
import { VoidBackupsLogo } from "@/components/layout/VoidBackupsLogo"
import { SetupPage } from "@/pages/SetupPage"
import { LoginPage } from "@/pages/LoginPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { AgentsPage } from "@/pages/AgentsPage"
import { SourcesPage } from "@/pages/SourcesPage"
import { JobsPage } from "@/pages/JobsPage"
import { JobDetailPage } from "@/pages/JobDetailPage"
import { HistoryPage } from "@/pages/HistoryPage"
import { RestorePage } from "@/pages/RestorePage"
import { NotificationsPage } from "@/pages/NotificationsPage"
import { SettingsPage } from "@/pages/SettingsPage"

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background">
      <VoidBackupsLogo size="lg" tagline />
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

function Gates() {
  const { status, user, isSetup } = useAuth()

  if (status === "loading") return <Splash />
  if (!isSetup || status === "setup") return <SetupPage />
  if (!user) return <LoginPage />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/restore" element={<RestorePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Gates />} />
    </Routes>
  )
}
