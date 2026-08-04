"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Clock3, ExternalLink, MapPin, UsersRound } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { addDaysISO, formatDate, weekLabel } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const DIAS = [
  { key: "seg", label: "Seg", offset: 0 },
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

type ReuniaoAgenda = {
  id: string
  titulo: string
  inicio: string
  fim: string | null
  local: string | null
  link: string | null
  participante_nomes: string[]
}

function horario(inicio: string, fim: string | null) {
  const inicioTexto = new Date(inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  if (!fim) return inicioTexto
  const fimTexto = new Date(fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  return `${inicioTexto}–${fimTexto}`
}

export function DashboardWeeklyAgenda({ semanaInicio }: { semanaInicio: string }) {
  const supabase = createClient()
  const [escalas, setEscalas] = useState<EscalaDashboard[]>([])
  const [reunioes, setReunioes] = useState<ReuniaoAgenda[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)
  const semanaFim = addDaysISO(semanaInicio, 6)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setLoading(true)
      const [escalaResult, reunioesResult] = await Promise.all([
        supabase.rpc("listar_escala_dashboard", { semana_inicio_param: semanaInicio }),
        supabase.rpc("listar_agenda_reunioes_dashboard", {
          data_inicio_param: semanaInicio,
          data_fim_param: semanaFim,
        }),
      ])
      if (!ativo) return
      setErro(Boolean(escalaResult.error || reunioesResult.error))
      setEscalas((escalaResult.data ?? []) as EscalaDashboard[])
      setReunioes((reunioesResult.data ?? []) as ReuniaoAgenda[])
      setLoading(false)
    }

    void carregar()
    return () => {
      ativo = false
    }
  }, [semanaFim, semanaInicio, supabase])

  const reunioesOrdenadas = useMemo(
    () => [...reunioes].sort((a, b) => a.inicio.localeCompare(b.inicio)),
    [reunioes],
  )
  const escopoPessoal = escalas.length > 0 && escalas.every((item) => item.escopo === "pessoal")

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="size-5 text-primary" />
              Agenda da semana
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{weekLabel(semanaInicio)} · reuniões e escala em modo de consulta.</p>
          </div>
          <Badge variant="outline">Somente leitura</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 p-4 xl:grid-cols-[0.8fr_1.2fr]">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="size-4 text-primary" />Reuniões</h3>
            <Badge variant="secondary">{reunioesOrdenadas.length}</Badge>
          </div>
          <div className="grid gap-2">
            {loading ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Carregando agenda...</p>
            ) : reunioesOrdenadas.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma reunião agendada para esta semana.</p>
            ) : reunioesOrdenadas.map((reuniao) => (
              <article key={reuniao.id} className="rounded-xl border bg-background/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{reuniao.titulo}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(reuniao.inicio).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{horario(reuniao.inicio, reuniao.fim)}</Badge>
                </div>
                {reuniao.local && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />{reuniao.local}</p>}
                {reuniao.link && (
                  <a href={reuniao.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <ExternalLink className="size-3" />Abrir reunião
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-primary" />{escopoPessoal ? "Minha escala" : "Escala da equipe"}</h3>
            <Badge variant="secondary">{escalas.length}</Badge>
          </div>
          <div className="grid gap-3">
            {loading ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Carregando escala...</p>
            ) : escalas.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum horário registrado para esta semana.</p>
            ) : escalas.map((escala) => (
              <article key={escala.colaborador_id} className="rounded-xl border bg-background/50 p-3">
                <div className="mb-3">
                  <p className="font-semibold">{escala.nome}</p>
                  {escala.funcao && <p className="text-xs text-muted-foreground">{escala.funcao}</p>}
                </div>
                <ScheduleRows escala={escala} semanaInicio={semanaInicio} />
              </article>
            ))}
          </div>
        </section>

        {erro && <p className="text-xs text-amber-600 xl:col-span-2">Parte da agenda não pôde ser carregada. Recarregue a página.</p>}
      </CardContent>
    </Card>
  )
}

function ScheduleRows({ escala, semanaInicio }: { escala: EscalaDashboard; semanaInicio: string }) {
  const grupos = [DIAS.slice(0, 4), DIAS.slice(4)]
  return (
    <div className="grid gap-2">
      {grupos.map((grupo, index) => (
        <div key={index} className={`grid gap-2 ${grupo.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          {grupo.map((dia) => {
            const valor = escala[dia.key]
            return (
              <div key={dia.key} className="min-w-0 rounded-lg border bg-muted/20 p-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{dia.label} · {formatDate(addDaysISO(semanaInicio, dia.offset)).slice(0, 5)}</p>
                <p className="mt-1 min-h-8 whitespace-pre-line break-words text-xs font-semibold leading-4">{valor?.trim() || "Sem horário"}</p>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
