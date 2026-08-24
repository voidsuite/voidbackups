/**
 * VoidBackups logo — shield + backup icon.
 */

import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

interface VoidBackupsLogoProps {
  size?: "sm" | "md" | "lg"
  tagline?: boolean
  className?: string
}

const sizes = {
  sm: { icon: "h-5 w-5", text: "text-base" },
  md: { icon: "h-6 w-6", text: "text-lg" },
  lg: { icon: "h-8 w-8", text: "text-xl" },
}

export function VoidBackupsLogo({ size = "md", tagline = false, className }: VoidBackupsLogoProps) {
  const s = sizes[size]
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center justify-center rounded-lg bg-primary/10 p-1.5">
        <ShieldCheck className={cn("text-primary", s.icon)} />
      </div>
      <div className="flex flex-col">
        <span className={cn("font-bold tracking-tight", s.text)}>VoidBackups</span>
        {tagline && (
          <span className="text-[10px] text-muted-foreground leading-none">
            Infrastructure Backup Manager
          </span>
        )}
      </div>
    </div>
  )
}
