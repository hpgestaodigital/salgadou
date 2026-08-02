"use client"

import { CalendarDays, Target } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format"

export type Meta = {
  id: string
  titulo: string
  descricao: string | null
  valor_atual: number
  valor_meta: number
  unidade: string
  data_inicio: string | null
  prazo: string | null
  status: "planejada" | "em_andamento" | "concluida" | "pausada"
  destaque: "laranja" | "azul" | "verde" | "violeta"
  exibir_dashboard: boolean
  criado_por: string
  created_at: string
  updated_at: string
}

const cores = { laranja: "bg-primary", azul: "bg-sky-500", verde: "bg-emerald-500", violeta: "bg-violet-500" }
const statusLabel = { planejada: "Planejada", em_andamento: "Em andamento", concluida: "Concluída", pausada: "Pausada" }

export function formatarValorMeta(valor: number, unidade: string) {
  if (unidade === "R$") return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  if (unidade === "%") return `${valor.toLocaleString("pt-BR")}%`
  return `${valor.toLocaleString("pt-BR")} ${unidade}`
}

export function percentualMeta(meta: Meta) {
  return Math.min(100, Math.max(0, (Number(meta.valor_atual) / Number(meta.valor_meta)) * 100))
}

export function GoalProgress({ meta, compact = false, slim = false, onClick }: { meta: Meta; compact?: boolean; slim?: boolean; onClick?: () => void }) {
  const percentual = percentualMeta(meta)
  return (
    <button type="button" onClick={onClick} className={cn("w-full rounded-2xl border border-border/70 bg-card text-left transition-colors hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", slim ? "px-3 py-2.5" : compact ? "p-4" : "p-5")} aria-label={`Ver detalhes da meta ${meta.titulo}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate font-heading text-sm font-bold text-foreground">{meta.titulo}</p><p className="mt-1 text-xs text-muted-foreground">{formatarValorMeta(Number(meta.valor_atual), meta.unidade)} de {formatarValorMeta(Number(meta.valor_meta), meta.unidade)}</p></div>
        <span className="shrink-0 text-sm font-extrabold text-foreground">{Math.round(percentual)}%</span>
      </div>
      <div className={cn("overflow-hidden rounded-full bg-muted", slim ? "mt-2 h-1.5" : "mt-3 h-2.5")} aria-hidden="true"><div className={cn("h-full rounded-full transition-[width] duration-500", cores[meta.destaque])} style={{ width: `${percentual}%` }} /></div>
      {!compact && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{statusLabel[meta.status]}</span>{meta.prazo && <span>Prazo: {formatDate(meta.prazo)}</span>}</div>}
    </button>
  )
}

export function GoalDetailsDialog({ meta, open, onOpenChange }: { meta: Meta | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!meta) return null
  const percentual = percentualMeta(meta)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2 font-heading text-xl"><Target className="size-5 text-primary" />{meta.titulo}</DialogTitle><DialogDescription>{meta.descricao || "Nenhuma observação adicional para esta meta."}</DialogDescription></DialogHeader>
      <div className="space-y-4"><div className="rounded-xl border border-border/70 bg-muted/25 p-4"><div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Progresso atual</p><p className="mt-1 font-heading text-2xl font-extrabold">{formatarValorMeta(Number(meta.valor_atual), meta.unidade)}</p></div><p className="text-sm text-muted-foreground">Meta: {formatarValorMeta(Number(meta.valor_meta), meta.unidade)}</p></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", cores[meta.destaque])} style={{ width: `${percentual}%` }} /></div><p className="mt-2 text-right text-sm font-bold">{Math.round(percentual)}% concluído</p></div>
        <div className="grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-xl border border-border/70 p-3"><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 font-semibold">{statusLabel[meta.status]}</p></div><div className="rounded-xl border border-border/70 p-3"><p className="text-xs text-muted-foreground">Período</p><p className="mt-1 flex items-center gap-1.5 font-semibold"><CalendarDays className="size-4 text-primary" />{meta.data_inicio ? formatDate(meta.data_inicio) : "Sem início"} — {meta.prazo ? formatDate(meta.prazo) : "Sem prazo"}</p></div></div>
      </div>
    </DialogContent></Dialog>
  )
}
