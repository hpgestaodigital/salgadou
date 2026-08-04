"use client"

import { useEffect, useState } from "react"
import { Clock3, Eye } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { addDaysISO, formatDate, weekLabel } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const DIAS_ESCALA = [
  { key: "ter", label: "Ter", offset: 1 },
  { key: "qua", label: "Qua", offset: 2 },
  { key: "qui", label: "Qui", offset: 3 },
  { key: "sex", label: "Sex", offset: 4 },
  { key: "sab", label: "Sáb", offset: 5 },
  { key: "dom", label: "Dom", offset: 6 },
] as const

type EscalaDashboard = {
  colaborador_id: string
  nome: string
  funcao: string | null
  semana_inicio: string
  seg: string | null
  ter: string | null
  qua: string | null
  qui: string | null
  sex: string | null
  sab: string | null
  dom: string | null
  escopo: "equipe" | "pessoal"
}

function dataCurta(data: string) {
  return formatDate(data).slice(0, 5)
}

export function DashboardTeamScale({ semanaInicio }: { semanaInicio: string }) {
  const supabase = createClient()
  const [escalas, setEscalas] = useState<EscalaDashboard[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setLoading(true)
      const resultado = await supabase.rpc("listar_escala_dashboard", {
        semana_inicio_param: semanaInicio,
      })
      if (!ativo) return
      setErro(Boolean(resultado.error))
      setEscalas((resultado.data ?? []) as EscalaDashboard[])
      setLoading(false)
    }

    void carregar()
    return () => {
      ativo = false
    }
  }, [semanaInicio, supabase])

  const escopoPessoal = escalas.length > 0 && escalas.every((item) => item.escopo === "pessoal")

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="size-4 text-primary" />
              {escopoPessoal ? "Minha escala" : "Escala da equipe"}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{weekLabel(semanaInicio)}</p>
          </div>
          <Badge variant="outline" className="gap-1 text-[10px]"><Eye className="size-3" />Consulta</Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 p-3">
        {loading ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Carregando escala...</p>
        ) : escalas.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum horário registrado para esta semana.</p>
        ) : escalas.map((escala) => (
          <article key={escala.colaborador_id} className="rounded-xl border bg-background/40 p-3">
            <div className="mb-3">
              <p className="text-sm font-semibold">{escala.nome}</p>
              {escala.funcao && <p className="text-[11px] text-muted-foreground">{escala.funcao}</p>}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {DIAS_ESCALA.map((dia) => {
                const valor = escala[dia.key]?.trim()
                return (
                  <div key={dia.key} className="min-w-0 rounded-lg bg-muted/25 px-2 py-2 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                      {dia.label} · {dataCurta(addDaysISO(semanaInicio, dia.offset))}
                    </p>
                    <p className={`mt-1 min-h-8 whitespace-pre-line break-words text-[11px] leading-4 ${valor ? "font-semibold" : "text-muted-foreground"}`}>
                      {valor || "—"}
                    </p>
                  </div>
                )
              })}
            </div>
          </article>
        ))}

        {erro && <p className="text-xs text-amber-600">Não foi possível atualizar a escala. Recarregue a página.</p>}
      </CardContent>
    </Card>
  )
}
