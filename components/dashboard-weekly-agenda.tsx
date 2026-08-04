"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Clock3, ExternalLink, MapPin, UsersRound } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { addDaysISO, formatDate, weekLabel } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const DIAS_ESCALA = [
  { key: "ter", label: "Terça", offset: 1 },
  { key: "qua", label: "Quarta", offset: 2 },
  { key: "qui", label: "Quinta", offset: 3 },
  { key: "sex", label: "Sexta", offset: 4 },
  { key: "sab", label: "Sábado", offset: 5 },
  { key: "dom", label: "Domingo", offset: 6 },
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

function dataCurta(data: string) {
  return formatDate(data).slice(0, 5)
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

      <CardContent className="grid gap-6 p-4 xl:grid-cols-[0.65fr_1.35fr]">
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

        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-primary" />{escopoPessoal ? "Minha escala" : "Escala da equipe"}</h3>
            <Badge variant="secondary">{escalas.length}</Badge>
          </div>

          {loading ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Carregando escala...</p>
          ) : escalas.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum horário registrado para esta semana.</p>
          ) : (
            <>
              <DesktopWeekGrid escalas={escalas} semanaInicio={semanaInicio} />
              <MobileWeekCards escalas={escalas} semanaInicio={semanaInicio} />
            </>
          )}
        </section>

        {erro && <p className="text-xs text-amber-600 xl:col-span-2">Parte da agenda não pôde ser carregada. Recarregue a página.</p>}
      </CardContent>
    </Card>
  )
}

function DesktopWeekGrid({ escalas, semanaInicio }: { escalas: EscalaDashboard[]; semanaInicio: string }) {
  const colunas = "grid-cols-[minmax(145px,1.25fr)_repeat(6,minmax(88px,1fr))]"

  return (
    <div className="hidden overflow-hidden rounded-xl border md:block">
      <div className={`grid ${colunas} bg-muted/40`}>
        <div className="border-r px-3 py-2.5 text-xs font-semibold text-muted-foreground">Pessoa</div>
        {DIAS_ESCALA.map((dia) => (
          <div key={dia.key} className="border-r px-2 py-2 text-center last:border-r-0">
            <p className="text-xs font-bold">{dia.label}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{dataCurta(addDaysISO(semanaInicio, dia.offset))}</p>
          </div>
        ))}
      </div>

      {escalas.map((escala, indice) => (
        <div key={escala.colaborador_id} className={`grid ${colunas} ${indice > 0 ? "border-t" : ""}`}>
          <div className="min-w-0 border-r px-3 py-3">
            <p className="truncate text-sm font-semibold">{escala.nome}</p>
            {escala.funcao && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{escala.funcao}</p>}
          </div>
          {DIAS_ESCALA.map((dia) => (
            <ScheduleCell key={dia.key} value={escala[dia.key]} />
          ))}
        </div>
      ))}
    </div>
  )
}

function MobileWeekCards({ escalas, semanaInicio }: { escalas: EscalaDashboard[]; semanaInicio: string }) {
  return (
    <div className="grid gap-3 md:hidden">
      {escalas.map((escala) => (
        <article key={escala.colaborador_id} className="rounded-xl border p-3">
          <p className="font-semibold">{escala.nome}</p>
          {escala.funcao && <p className="text-xs text-muted-foreground">{escala.funcao}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DIAS_ESCALA.map((dia) => (
              <div key={dia.key} className="rounded-lg bg-muted/25 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{dia.label} · {dataCurta(addDaysISO(semanaInicio, dia.offset))}</p>
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
    <div className="flex min-h-14 items-center justify-center border-r px-2 py-2 text-center last:border-r-0">
      <p className={`whitespace-pre-line text-xs leading-4 ${preenchido ? "font-semibold" : "text-muted-foreground"}`}>
        {value?.trim() || "—"}
      </p>
    </div>
  )
}
