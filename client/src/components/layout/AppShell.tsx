/**
 * App shell — wraps authenticated pages with sidebar + content area.
 */

import { Outlet } from "react-router"
import { Sidebar } from "./Sidebar"

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
