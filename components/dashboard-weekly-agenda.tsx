"use client"

import { useEffect, useState } from "react"
import { Clock3, Eye } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { addDaysISO, formatDate, weekLabel } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const PRIMEIRA_LINHA = [
  { key: "ter", label: "Terça", offset: 1 },
  { key: "qua", label: "Quarta", offset: 2 },
  { key: "qui", label: "Quinta", offset: 3 },
] as const

const SEGUNDA_LINHA = [
  { key: "sex", label: "Sexta", offset: 4 },
  { key: "sab", label: "Sábado", offset: 5 },
  { key: "dom", label: "Domingo", offset: 6 },
] as const

type DiaEscala = (typeof PRIMEIRA_LINHA)[number] | (typeof SEGUNDA_LINHA)[number]

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

export function DashboardWeeklyScale({ semanaInicio }: { semanaInicio: string }) {
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
              {escopoPessoal ? "Minha escala" : "Escala semanal"}
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
        ) : (
          <>
            <div className="hidden gap-3 sm:grid">
              <ScaleTable escalas={escalas} dias={PRIMEIRA_LINHA} semanaInicio={semanaInicio} />
              <ScaleTable escalas={escalas} dias={SEGUNDA_LINHA} semanaInicio={semanaInicio} />
            </div>
            <MobileScaleCards escalas={escalas} semanaInicio={semanaInicio} />
          </>
        )}

        {erro && <p className="text-xs text-amber-600">Não foi possível atualizar a escala. Recarregue a página.</p>}
      </CardContent>
    </Card>
  )
}

function ScaleTable({
  escalas,
  dias,
  semanaInicio,
}: {
  escalas: EscalaDashboard[]
  dias: readonly DiaEscala[]
  semanaInicio: string
}) {
  const colunas = "grid-cols-[minmax(105px,1.15fr)_repeat(3,minmax(68px,1fr))]"

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className={`grid ${colunas} bg-muted/40`}>
        <div className="border-r px-2.5 py-2 text-[11px] font-semibold text-muted-foreground">Pessoa</div>
        {dias.map((dia) => (
          <div key={dia.key} className="border-r px-1.5 py-2 text-center last:border-r-0">
            <p className="text-[11px] font-bold">{dia.label}</p>
            <p className="text-[9px] text-muted-foreground">{dataCurta(addDaysISO(semanaInicio, dia.offset))}</p>
          </div>
        ))}
      </div>

      {escalas.map((escala, indice) => (
        <div key={escala.colaborador_id} className={`grid ${colunas} ${indice > 0 ? "border-t" : ""}`}>
          <div className="min-w-0 border-r px-2.5 py-2.5">
            <p className="truncate text-xs font-semibold">{escala.nome}</p>
            {escala.funcao && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{escala.funcao}</p>}
          </div>
          {dias.map((dia) => <ScheduleCell key={dia.key} value={escala[dia.key]} />)}
        </div>
      ))}
    </div>
  )
}

function MobileScaleCards({ escalas, semanaInicio }: { escalas: EscalaDashboard[]; semanaInicio: string }) {
  return (
    <div className="grid gap-3 sm:hidden">
      {escalas.map((escala) => (
        <article key={escala.colaborador_id} className="rounded-xl border p-3">
          <p className="text-sm font-semibold">{escala.nome}</p>
          {escala.funcao && <p className="text-xs text-muted-foreground">{escala.funcao}</p>}
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {[...PRIMEIRA_LINHA, ...SEGUNDA_LINHA].map((dia) => (
              <div key={dia.key} className="rounded-lg bg-muted/25 p-2">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">
                  {dia.label} · {dataCurta(addDaysISO(semanaInicio, dia.offset))}
                </p>
                <p className={`mt-1 whitespace-pre-line text-xs ${escala[dia.key]?.trim() ? "font-semibold" : "text-muted-foreground"}`}>
                  {escala[dia.key]?.trim() || "—"}
                </p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

function ScheduleCell({ value }: { value: string | null }) {
  const preenchido = Boolean(value?.trim())
  return (
    <div className="flex min-h-12 items-center justify-center border-r px-1.5 py-2 text-center last:border-r-0">
      <p className={`whitespace-pre-line break-words text-[11px] leading-4 ${preenchido ? "font-semibold" : "text-muted-foreground"}`}>
        {value?.trim() || "—"}
      </p>
    </div>
  )
}
