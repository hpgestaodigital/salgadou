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
    default: "bg-white/5 text-muted-foreground",
    primary: "bg-primary/12 text-primary ring-1 ring-primary/15",
    success: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/15",
    warning: "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/15",
  }
  return (
    <Card className="p-5 sm:p-6 flex-row items-start justify-between gap-4 transition-colors hover:border-primary/25">
      <div className="space-y-2 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}>
        <Icon className="size-5" />
      </span>
    </Card>
  )
}
