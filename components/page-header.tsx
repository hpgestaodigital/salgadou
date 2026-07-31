import type React from "react"

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7">
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Visão geral</p>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-balance text-foreground">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}
