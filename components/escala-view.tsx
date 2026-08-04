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
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getPapel } from "@/lib/auth-roles"

type Draft = Record<string, Partial<Escala>>

const DIAS_ESCALA = DIAS.filter((dia) => dia.key !== "seg")

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
  return `${horas} h${resto ? ` ${resto} min` : ""} na semana`
}

export function EscalaView() {
  const supabase = createClient()
  const [semana, setSemana] = useState(() => mondayOf(todayISO()))
  const [draft, setDraft] = useState<Draft>({})
  const [saving, setSaving] = useState(false)
  const [podeEditar, setPodeEditar] = useState(false)
  const { data: colaboradores, isLoading } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const { data: escalas, mutate } = useTable<Escala>("escala")
  const ativos = useMemo(
    () => colaboradores.filter((colaborador) => colaborador.ativo && colaborador.participa_escala !== false),
    [colaboradores],
  )

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
    escalas
      .filter((item) => item.semana_inicio === semana)
      .forEach((item) => mapa.set(item.colaborador_id, item))
    return mapa
  }, [escalas, semana])

  function getValue(colaboradorId: string, dia: string) {
    const alterado = draft[colaboradorId]
    if (alterado && dia in alterado) return (alterado as Record<string, string>)[dia] ?? ""
    return ((escalaDaSemana.get(colaboradorId) as Record<string, string | undefined> | undefined)?.[dia]) ?? ""
  }

  function setValue(colaboradorId: string, dia: string, valor: string) {
    if (!podeEditar) return
    setDraft((atual) => ({
      ...atual,
      [colaboradorId]: { ...atual[colaboradorId], [dia]: valor },
    }))
  }

  function totalDaSemana(colaboradorId: string) {
    return DIAS_ESCALA.reduce(
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
    const { error } = await supabase.from("escala").upsert(rows, {
      onConflict: "semana_inicio,colaborador_id",
    })
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
        description="Defina os horários da equipe de terça a domingo. A edição é exclusiva de administradores e sócios."
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
            <Button variant="outline" size="icon" onClick={() => mudarSemana(-7)} aria-label="Semana anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-56 text-center">
              <p className="text-xs text-muted-foreground">Semana</p>
              <p className="font-heading font-bold">{weekLabel(semana)}</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => mudarSemana(7)} aria-label="Próxima semana">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => mudarSemana(0)}>Ir para semana atual</Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="sticky left-0 z-10 min-w-44 bg-muted/50">Colaborador</TableHead>
                {DIAS_ESCALA.map((dia) => {
                  const indice = DIAS.findIndex((item) => item.key === dia.key)
                  return (
                    <TableHead key={dia.key} className="min-w-52 text-center">
                      <span className="block font-bold">{dia.label}</span>
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {formatDate(addDaysISO(semana, indice)).slice(0, 5)}
                      </span>
                    </TableHead>
                  )
                })}
                <TableHead className="min-w-40 text-right">Total semanal</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">Carregando...</TableCell>
                </TableRow>
              ) : ativos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Nenhuma pessoa participa da Escala Semanal.
                  </TableCell>
                </TableRow>
              ) : ativos.map((colaborador) => {
                const total = totalDaSemana(colaborador.id)
                return (
                  <TableRow key={colaborador.id}>
                    <TableCell className="sticky left-0 z-10 bg-card font-semibold">
                      <span className="block max-w-40 truncate">{colaborador.nome}</span>
                      {colaborador.funcao && (
                        <span className="block text-xs font-normal text-muted-foreground">{colaborador.funcao}</span>
                      )}
                    </TableCell>

                    {DIAS_ESCALA.map((dia) => (
                      <TableCell key={dia.key} className="p-1">
                        <Input
                          value={getValue(colaborador.id, dia.key)}
                          onChange={(event) => setValue(colaborador.id, dia.key, event.target.value)}
                          readOnly={!podeEditar}
                          placeholder="08:00–13:00 / 18:00–22:00"
                          className="h-9 text-center text-xs"
                          aria-label={`${colaborador.nome}, ${dia.label}: intervalos de horário`}
                        />
                      </TableCell>
                    ))}

                    <TableCell className="text-right">
                      <span className="block whitespace-nowrap font-heading font-bold text-primary">
                        {formatarTotalSemanal(total.minutos)}
                      </span>
                      {total.invalidos > 0 && (
                        <span className="mt-1 block text-xs text-destructive">
                          {total.invalidos} intervalo(s) inválido(s)
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
