import type React from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string
  value: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: "default" | "primary" | "success" | "warning"
}) {
  const tones: Record<string, string> = {
    default: "bg-muted text-foreground",
    primary: "bg-primary/15 text-primary",
    success: "bg-accent text-accent-foreground",
    warning: "bg-chart-3/20 text-chart-3",
  }
  return (
    <Card className="p-5 flex items-start justify-between gap-4">
      <div className="space-y-1 min-w-0">
        <p className="text-sm text-muted-foreground truncate">{label}</p>
        <p className="font-heading text-2xl font-extrabold tracking-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
      </div>
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}>
        <Icon className="size-5" />
      </span>
    </Card>
  )
}
