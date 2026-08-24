/**
 * App sidebar — navigation for VoidBackups.
 */

import { NavLink } from "react-router"
import {
  LayoutDashboard,
  Server,
  HardDrive,
  Clock,
  RotateCcw,
  Bell,
  Settings,
  LogOut,
  Shield,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { VoidBackupsLogo } from "@/components/layout/VoidBackupsLogo"

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
}

interface SeparatorItem {
  separator: boolean
}

const navItems: (NavItem | SeparatorItem)[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/agents", icon: Server, label: "Agents" },
  { to: "/sources", icon: HardDrive, label: "Sources" },
  { to: "/jobs", icon: Clock, label: "Backup Jobs" },
  { to: "/history", icon: Clock, label: "History" },
  { to: "/restore", icon: RotateCcw, label: "Restore" },
  { separator: true },
  { to: "/notifications", icon: Bell, label: "Notifications" },
  { to: "/settings", icon: Settings, label: "Settings" },
]

export function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 px-4">
        <VoidBackupsLogo size="sm" />
      </div>

      <Separator />

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item, i) => {
          if ("separator" in item && item.separator) {
            return <Separator key={i} className="my-3" />
          }
          if ("icon" in item && "to" in item) {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          }
          return null
        })}
      </nav>

      <Separator />

      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.name || "Admin"}</p>
          <p className="text-xs text-muted-foreground truncate">Passkey</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  )
}
