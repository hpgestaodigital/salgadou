"use client"

import { useState } from "react"
import { Target } from "lucide-react"
import { useTable } from "@/lib/use-data"
import { GoalDetailsDialog, GoalProgress, type Meta } from "@/components/goal-progress"

export function DashboardGoals() {
  const { data: metas, error } = useTable<Meta>("metas", { column: "prazo", ascending: true })
  const [selecionada, setSelecionada] = useState<Meta | null>(null)
  const visiveis = metas.filter((meta) => meta.exibir_dashboard && meta.status !== "pausada")
  if (error) return null

  if (visiveis.length === 0) {
    return (
      <section aria-label="Metas da Salgadou" className="mb-4 flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Target className="size-4" /></span>
        <div><p className="font-heading text-sm font-bold">Metas a definir</p><p className="text-xs text-muted-foreground">Ainda não há uma meta publicada para a equipe.</p></div>
      </section>
    )
  }

  return (
    <section aria-labelledby="metas-dashboard-inicial-titulo" className="mb-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.07] via-card to-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2"><Target className="size-5 text-primary" /><div><h2 id="metas-dashboard-inicial-titulo" className="font-heading text-sm font-extrabold">Metas da Salgadou</h2><p className="text-xs text-muted-foreground">Clique em uma meta para acompanhar os detalhes.</p></div></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visiveis.slice(0, 3).map((meta) => <GoalProgress key={meta.id} meta={meta} compact onClick={() => setSelecionada(meta)} />)}</div>
      {visiveis.length > 3 && <p className="mt-3 text-xs text-muted-foreground">Mais {visiveis.length - 3} meta(s) disponível(is) na seção Metas.</p>}
      <GoalDetailsDialog meta={selecionada} open={Boolean(selecionada)} onOpenChange={(open) => !open && setSelecionada(null)} />
    </section>
  )
}

export function GlobalGoalsBar() {
  const { data: metas, error } = useTable<Meta>("metas", { column: "prazo", ascending: true })
  const [selecionada, setSelecionada] = useState<Meta | null>(null)
  const visiveis = metas.filter((meta) => meta.exibir_dashboard && meta.status !== "pausada")
  if (error) return null

  if (visiveis.length === 0) {
    return (
      <section aria-label="Metas da Salgadou" className="mx-auto flex w-full max-w-5xl items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-center sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Target className="size-4" /></span>
        <div className="text-left"><p className="font-heading text-sm font-bold">Metas a definir</p><p className="text-xs text-muted-foreground">Ainda não há uma meta publicada para a equipe.</p></div>
      </section>
    )
  }

  return (
    <section aria-labelledby="metas-dashboard-titulo" className="mx-auto w-full max-w-5xl rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.07] via-card to-card p-2.5 sm:p-3">
      <div className="grid items-center gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex items-center justify-center gap-2 text-center lg:justify-start lg:text-left"><Target className="size-5 shrink-0 text-primary" /><div><h2 id="metas-dashboard-titulo" className="font-heading text-sm font-extrabold">Metas da Salgadou</h2><p className="text-[11px] text-muted-foreground">Clique para ver detalhes.</p></div></div>
        <div className="flex gap-3 overflow-x-auto">{visiveis.slice(0, 3).map((meta) => <div key={meta.id} className="min-w-[230px] flex-1"><GoalProgress meta={meta} compact slim onClick={() => setSelecionada(meta)} /></div>)}{visiveis.length > 3 && <div className="grid min-w-24 place-items-center rounded-xl border border-dashed border-border px-3 text-center text-xs text-muted-foreground">+{visiveis.length - 3}<br />meta(s)</div>}</div>
      </div>
      <GoalDetailsDialog meta={selecionada} open={Boolean(selecionada)} onOpenChange={(open) => !open && setSelecionada(null)} />
    </section>
  )
}
