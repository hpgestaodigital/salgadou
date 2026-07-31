"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, Save, Send } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useTable } from "@/lib/use-data"
import type { Colaborador, Configuracao, Escala } from "@/lib/types"
import { DIAS } from "@/lib/types"
import { enviarWhatsapp, preencherTemplate, TEMPLATE_KEYS } from "@/lib/whatsapp"
import { addDaysISO, formatDate, mondayOf, todayISO, weekLabel } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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
      const horarioValido =
        inicioHora <= 23 && fimHora <= 23 && inicioMinuto <= 59 && fimMinuto <= 59
      const inicio = inicioHora * 60 + inicioMinuto
      const fim = fimHora * 60 + fimMinuto

      if (!horarioValido || fim <= inicio) {
        total.invalidos += 1
      } else {
        total.minutos += fim - inicio
      }
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
  const [semana, setSemana] = useState<string>(() => mondayOf(todayISO()))
  const [draft, setDraft] = useState<Draft>({})
  const [saving, setSaving] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const { data: colaboradores, isLoading } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const { data: escalas, mutate } = useTable<Escala>("escala")
  const { data: config } = useTable<Configuracao>("configuracoes")

  const ativos = useMemo(() => colaboradores.filter((c) => c.ativo), [colaboradores])

  async function enviarLembretes() {
    const template =
      config.find((c) => c.chave === TEMPLATE_KEYS.escala)?.valor ||
      "Olá {nome}! Lembrete da Salgadou: você tem escala nesta semana."
    const destinatarios = ativos.filter((c) => c.whatsapp && c.whatsapp.trim())
    if (destinatarios.length === 0) {
      toast.error("Nenhum colaborador ativo com WhatsApp cadastrado.")
      return
    }
    setEnviando(true)
    let ok = 0
    let falhas = 0
    for (const c of destinatarios) {
      try {
        await enviarWhatsapp(c.whatsapp as string, preencherTemplate(template, { nome: c.nome }))
        ok++
      } catch {
        falhas++
      }
    }
    setEnviando(false)
    if (ok > 0) toast.success(`Lembretes enviados: ${ok}.${falhas ? ` Falhas: ${falhas}.` : ""}`)
    else toast.error("Não foi possível enviar os lembretes. Verifique as Configurações.")
  }

  const escalaDaSemana = useMemo(() => {
    const map = new Map<string, Escala>()
    escalas.filter((e) => e.semana_inicio === semana).forEach((e) => map.set(e.colaborador_id, e))
    return map
  }, [escalas, semana])

  function getValue(colId: string, dia: string): string {
    const d = draft[colId]
    if (d && dia in d) return (d as Record<string, string>)[dia] ?? ""
    const existente = escalaDaSemana.get(colId)
    return ((existente as Record<string, string> | undefined)?.[dia] as string) ?? ""
  }

  function setValue(colId: string, dia: string, value: string) {
    setDraft((prev) => ({ ...prev, [colId]: { ...prev[colId], [dia]: value } }))
  }

  const temAlteracoes = Object.keys(draft).length > 0

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
    setSaving(true)
    try {
      const rows = ativos
        .filter((c) => draft[c.id])
        .map((c) => {
          const existente = escalaDaSemana.get(c.id)
          const base: Record<string, string | null> = {}
          DIAS.forEach(({ key }) => {
            base[key] = getValue(c.id, key) || null
          })
          return {
            ...(existente?.id ? { id: existente.id } : {}),
            semana_inicio: semana,
            colaborador_id: c.id,
            ...base,
          }
        })

      if (rows.length === 0) {
        setSaving(false)
        return
      }

      const { error } = await supabase.from("escala").upsert(rows, { onConflict: "semana_inicio,colaborador_id" })
      if (error) throw error
      toast.success("Escala salva com sucesso.")
      setDraft({})
      mutate()
    } catch (e) {
      console.log("[v0] erro ao salvar escala:", e)
      toast.error("Não foi possível salvar a escala.")
    } finally {
      setSaving(false)
    }
  }

  function mudarSemana(dias: number) {
    if (temAlteracoes && !confirm("Há alterações não salvas. Deseja descartá-las?")) return
    setDraft({})
    setSemana((s) => mondayOf(addDaysISO(s, dias)))
  }

  return (
    <div>
      <PageHeader
        title="Escala Semanal"
        description="Defina intervalos precisos e até dois turnos por dia, por exemplo: 08:00–13:00 / 18:00–22:00."
        action={
          <>
            <Button variant="outline" onClick={enviarLembretes} disabled={enviando || ativos.length === 0}>
              {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar lembretes
            </Button>
            <Button onClick={salvar} disabled={!temAlteracoes || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salvar escala
            </Button>
          </>
        }
      />

      <Card className="p-4 mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => mudarSemana(-7)} aria-label="Semana anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-center min-w-52">
            <p className="text-xs text-muted-foreground">Semana</p>
            <p className="font-heading font-bold">{weekLabel(semana)}</p>
          </div>
          <Button variant="outline" size="icon" onClick={() => mudarSemana(7)} aria-label="Próxima semana">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => mudarSemana(0)} className="self-start sm:self-auto">
          Ir para semana atual
        </Button>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="min-w-44 sticky left-0 bg-muted/50 z-10">Colaborador</TableHead>
                {DIAS.map((d, i) => (
                  <TableHead key={d.key} className="min-w-52 text-center">
                    <span className="block font-bold">{d.label}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {formatDate(addDaysISO(semana, i)).slice(0, 5)}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="min-w-40 text-right">Total semanal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : ativos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    Nenhum colaborador ativo. Cadastre em &quot;Cadastros&quot;.
                  </TableCell>
                </TableRow>
              ) : (
                ativos.map((c) => {
                  const total = totalDaSemana(c.id)
                  return (
                  <TableRow key={c.id}>
                    <TableCell className="sticky left-0 bg-card z-10 font-semibold">
                      <span className="block truncate max-w-40">{c.nome}</span>
                      {c.funcao && <span className="block text-xs font-normal text-muted-foreground">{c.funcao}</span>}
                    </TableCell>
                    {DIAS.map((d) => (
                      <TableCell key={d.key} className="p-1">
                        <Input
                          value={getValue(c.id, d.key)}
                          onChange={(e) => setValue(c.id, d.key, e.target.value)}
                          placeholder="08:00–13:00 / 18:00–22:00"
                          className="h-9 text-center text-xs"
                          aria-label={`${c.nome}, ${d.label}: intervalos de horário`}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <span className="block whitespace-nowrap font-heading font-bold text-primary">
                        {formatarTotalSemanal(total.minutos)}
                      </span>
                      {total.invalidos > 0 && (
                        <span className="mt-1 block text-xs text-destructive">
                          {total.invalidos} intervalo(s) inválido(s) ignorado(s)
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
