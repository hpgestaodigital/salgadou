"use client"

import { useEffect, useState } from "react"
import type React from "react"
import { Card } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { formatBRL, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"

function labelMes(mes: string) {
  const [ano, numeroMes] = mes.split("-").map(Number)
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(ano, numeroMes - 1, 1))
}

function VencidosOutrosMeses({ label }: { label: string }) {
  const periodoSelecionado = label.match(/^Vencido\s*·\s*(.+)$/i)?.[1]?.trim()
  const [texto, setTexto] = useState("")

  useEffect(() => {
    if (!periodoSelecionado || periodoSelecionado === "todos os períodos") {
      setTexto("")
      return
    }

    let ativo = true
    const supabase = createClient()

    ;(async () => {
      const { data, error } = await supabase
        .from("pagamentos_fornecedores")
        .select("vencimento,valor,pago_em")
        .is("pago_em", null)
        .lt("vencimento", todayISO())

      if (!ativo || error) return

      const porMes = new Map<string, number>()
      for (const pagamento of data ?? []) {
        const mes = String(pagamento.vencimento ?? "").slice(0, 7)
        if (!mes || labelMes(mes) === periodoSelecionado) continue
        porMes.set(mes, (porMes.get(mes) ?? 0) + Number(pagamento.valor ?? 0))
      }

      const meses = Array.from(porMes.entries())
        .filter(([, valor]) => valor > 0)
        .sort(([a], [b]) => b.localeCompare(a))

      if (!meses.length) {
        setTexto("")
        return
      }

      if (meses.length === 1) {
        const [mes, valor] = meses[0]
        setTexto(`+ dívida vencida de ${labelMes(mes)}: ${formatBRL(valor)}`)
        return
      }

      const principais = meses
        .slice(0, 2)
        .map(([mes, valor]) => `${labelMes(mes)}: ${formatBRL(valor)}`)
        .join(" · ")
      const restantes = meses.length - 2
      setTexto(`+ dívidas vencidas — ${principais}${restantes > 0 ? ` · +${restantes} mês(es)` : ""}`)
    })()

    return () => {
      ativo = false
    }
  }, [periodoSelecionado])

  if (!texto) return null
  return <p className="text-xs leading-relaxed text-amber-300/90">{texto}</p>
}

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
        {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : <VencidosOutrosMeses label={label} />}
      </div>
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}>
        <Icon className="size-5" />
      </span>
    </Card>
  )
}
