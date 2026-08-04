"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useTable } from "@/lib/use-data"
import type { Colaborador, Escala } from "@/lib/types"
import { DIAS } from "@/lib/types"
import { addDaysISO, formatDate, mondayOf, todayISO, weekLabel } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getPapel } from "@/lib/auth-roles"

type Draft = Record<string, Partial<Escala>>

function calcularMinutos(valor: string) {
  const texto = valor.trim()
  if (!texto || /^(folga|off|—|-)$/i.test(texto)) return { minutos: 0, invalidos: 0 }
  const intervalos = [...texto.matchAll(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/g)]
  if (intervalos.length === 0) return { minutos: 0, invalidos: 1 }

  return intervalos.reduce(
    (total, intervalo) => {
      const inicioHora = Number(intervalo[1])
      const inicioMinuto = Number(intervalo[2])
      const fimHora = Number(intervalo[3])
      const fimMinuto = Number(intervalo[4])
      const valido = inicioHora <= 23 && fimHora <= 23 && inicioMinuto <= 59 && fimMinuto <= 59
      const inicio = inicioHora * 60 + inicioMinuto
      const fim = fimHora * 60 + fimMinuto
      if (!valido || fim <= inicio) total.invalidos += 1
      else total.minutos += fim - inicio
      return total
    },
    { minutos: 0, invalidos: 0 },
  )
}

function formatarTotalSemanal(minutos: number) {
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return `${horas} h${resto ? ` ${resto} min` : ""}`
}

export function EscalaView() {
  const supabase = createClient()
  const [semana, setSemana] = useState(() => mondayOf(todayISO()))
  const [draft, setDraft] = useState<Draft>({})
  const [saving, setSaving] = useState(false)
  const [podeEditar, setPodeEditar] = useState(false)
  const { data: colaboradores, isLoading } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const { data: escalas, mutate } = useTable<Escala>("escala")
  const ativos = useMemo(() => colaboradores.filter((c) => c.ativo && c.participa_escala !== false), [colaboradores])

  useEffect(() => {
    let ativo = true
    supabase.auth.getUser().then(({ data }: { data: { user: import("@supabase/supabase-js").User | null } }) => {
      if (!ativo) return
      setPodeEditar(["admin", "socio"].includes(getPapel(data.user)))
    })
    return () => {
      ativo = false
    }
  }, [supabase])

  const escalaDaSemana = useMemo(() => {
    const mapa = new Map<string, Escala>()
    escalas.filter((item) => item.semana_inicio === semana).forEach((item) => mapa.set(item.colaborador_id, item))
    return mapa
  }, [escalas, semana])

  function getValue(colaboradorId: string, dia: string) {
    const alterado = draft[colaboradorId]
    if (alterado && dia in alterado) return (alterado as Record<string, string>)[dia] ?? ""
    return ((escalaDaSemana.get(colaboradorId) as Record<string, string | undefined> | undefined)?.[dia]) ?? ""
  }

  function setValue(colaboradorId: string, dia: string, valor: string) {
    if (!podeEditar) return
    setDraft((atual) => ({ ...atual, [colaboradorId]: { ...atual[colaboradorId], [dia]: valor } }))
  }

  function totalDaSemana(colaboradorId: string) {
    return DIAS.reduce(
      (total, dia) => {
        const calculado = calcularMinutos(getValue(colaboradorId, dia.key))
        total.minutos += calculado.minutos
        total.invalidos += calculado.invalidos
        return total
      },
      { minutos: 0, invalidos: 0 },
    )
  }

  async function salvar() {
    if (!podeEditar) return toast.error("Somente administradores e sócios podem alterar a escala.")
    const rows = ativos
      .filter((colaborador) => draft[colaborador.id])
      .map((colaborador) => {
        const existente = escalaDaSemana.get(colaborador.id)
        const horarios: Record<string, string | null> = {}
        DIAS.forEach(({ key }) => {
          horarios[key] = getValue(colaborador.id, key) || null
        })
        return {
          ...(existente?.id ? { id: existente.id } : {}),
          semana_inicio: semana,
          colaborador_id: colaborador.id,
          ...horarios,
        }
      })

    if (!rows.length) return
    setSaving(true)
    const { error } = await supabase.from("escala").upsert(rows, { onConflict: "semana_inicio,colaborador_id" })
    setSaving(false)
    if (error) return toast.error("Não foi possível salvar a escala.")
    setDraft({})
    await mutate()
    toast.success("Escala salva com sucesso.")
  }

  function mudarSemana(dias: number) {
    if (Object.keys(draft).length && !confirm("Há alterações não salvas. Deseja descartá-las?")) return
    setDraft({})
    setSemana((atual) => mondayOf(addDaysISO(atual, dias)))
  }

  return (
    <div>
      <PageHeader
        title="Escala Semanal"
        description="Área de gestão exclusiva de administradores e sócios. Cada pessoa ocupa duas linhas visuais, sem rolagem horizontal."
        action={
          <Button onClick={salvar} disabled={!podeEditar || !Object.keys(draft).length || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar escala
          </Button>
        }
      />

      <Card className="mb-5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => mudarSemana(-7)} aria-label="Semana anterior"><ChevronLeft className="size-4" /></Button>
            <div className="min-w-56 text-center">
              <p className="text-xs text-muted-foreground">Semana</p>
              <p className="font-heading font-bold">{weekLabel(semana)}</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => mudarSemana(7)} aria-label="Próxima semana"><ChevronRight className="size-4" /></Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => mudarSemana(0)}>Ir para semana atual</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {isLoading ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Carregando escala...</CardContent></Card>
        ) : ativos.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhuma pessoa participa da Escala Semanal.</CardContent></Card>
        ) : ativos.map((colaborador) => {
          const total = totalDaSemana(colaborador.id)
          return (
            <Card key={colaborador.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{colaborador.nome}</CardTitle>
                    {colaborador.funcao && <p className="mt-1 text-xs text-muted-foreground">{colaborador.funcao}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-heading font-bold text-primary">{formatarTotalSemanal(total.minutos)}</p>
                    {total.invalidos > 0 && <p className="text-xs text-destructive">{total.invalidos} intervalo(s) inválido(s)</p>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <DayRow dias={DIAS.slice(0, 4)} semana={semana} colaborador={colaborador} getValue={getValue} setValue={setValue} podeEditar={podeEditar} />
                <DayRow dias={DIAS.slice(4)} semana={semana} colaborador={colaborador} getValue={getValue} setValue={setValue} podeEditar={podeEditar} />
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function DayRow({
  dias,
  semana,
  colaborador,
  getValue,
  setValue,
  podeEditar,
}: {
  dias: readonly { key: string; label: string }[]
  semana: string
  colaborador: Colaborador
  getValue: (id: string, dia: string) => string
  setValue: (id: string, dia: string, valor: string) => void
  podeEditar: boolean
}) {
  return (
    <div className={`grid gap-3 ${dias.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
      {dias.map((dia) => {
        const indice = DIAS.findIndex((item) => item.key === dia.key)
        return (
          <div key={dia.key} className="grid min-w-0 gap-1.5 rounded-xl border bg-muted/15 p-3">
            <label htmlFor={`${colaborador.id}-${dia.key}`} className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {dia.label} · {formatDate(addDaysISO(semana, indice)).slice(0, 5)}
            </label>
            <Input
              id={`${colaborador.id}-${dia.key}`}
              value={getValue(colaborador.id, dia.key)}
              onChange={(event) => setValue(colaborador.id, dia.key, event.target.value)}
              readOnly={!podeEditar}
              placeholder="08:00–13:00 / 18:00–22:00"
              className="h-auto min-h-11 text-center text-xs"
            />
          </div>
        )
      })}
    </div>
  )
}
