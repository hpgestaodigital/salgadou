"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Eye,
  Factory,
  MapPin,
  UsersRound,
} from "lucide-react"
import { useTable } from "@/lib/use-data"
import { todayISO } from "@/lib/format"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type PlanoProducao = {
  id: string
  data_producao: string
  produto_id: string
  quantidade: number
  status: "planejado" | "em_producao" | "concluido" | "cancelado"
  observacoes: string | null
}

type ProdutoProducao = { id: string; nome: string; unidade: string }

type ReuniaoAgenda = {
  id: string
  titulo: string
  inicio: string
  fim: string | null
  local: string | null
  link: string | null
  participante_nomes: string[]
}

const STATUS: Record<PlanoProducao["status"], string> = {
  planejado: "Planejado",
  em_producao: "Em produção",
  concluido: "Concluído",
  cancelado: "Cancelado",
}

function chaveLocal(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`
}

function chaveIsoLocal(iso: string) {
  return chaveLocal(new Date(iso))
}

function horaReuniao(inicio: string, fim: string | null) {
  const horaInicio = new Date(inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  if (!fim) return horaInicio
  const horaFim = new Date(fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  return `${horaInicio}–${horaFim}`
}

export function DashboardProductionCalendar() {
  const supabase = createClient()
  const hoje = todayISO()
  const dataHoje = new Date(`${hoje}T12:00:00`)
  const [mes, setMes] = useState(() => new Date(dataHoje.getFullYear(), dataHoje.getMonth(), 1))
  const [diaSelecionado, setDiaSelecionado] = useState(hoje)
  const [reunioes, setReunioes] = useState<ReuniaoAgenda[]>([])
  const [erroReunioes, setErroReunioes] = useState(false)
  const { data: planos } = useTable<PlanoProducao>("producao_planejamento", { column: "data_producao" })
  const { data: produtos } = useTable<ProdutoProducao>("producao_produtos", { column: "nome" })

  const dias = useMemo(() => {
    const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1)
    inicio.setDate(inicio.getDate() - inicio.getDay())
    return Array.from({ length: 42 }, (_, indice) => {
      const data = new Date(inicio)
      data.setDate(inicio.getDate() + indice)
      return { data, chave: chaveLocal(data), pertenceAoMes: data.getMonth() === mes.getMonth() }
    })
  }, [mes])

  const intervaloAgenda = useMemo(() => ({
    inicio: dias[0]?.chave ?? chaveLocal(mes),
    fim: dias[dias.length - 1]?.chave ?? chaveLocal(mes),
  }), [dias, mes])

  useEffect(() => {
    let ativo = true

    async function carregarReunioes() {
      const resultado = await supabase.rpc("listar_agenda_reunioes_dashboard", {
        data_inicio_param: intervaloAgenda.inicio,
        data_fim_param: intervaloAgenda.fim,
      })
      if (!ativo) return
      if (resultado.error) {
        setErroReunioes(true)
        setReunioes([])
      } else {
        setErroReunioes(false)
        setReunioes((resultado.data ?? []) as ReuniaoAgenda[])
      }
    }

    void carregarReunioes()
    return () => {
      ativo = false
    }
  }, [intervaloAgenda.fim, intervaloAgenda.inicio, supabase])

  const produtosPorId = useMemo(() => new Map(produtos.map((produto) => [produto.id, produto])), [produtos])
  const planosPorDia = useMemo(() => {
    const mapa = new Map<string, PlanoProducao[]>()
    for (const plano of planos.filter((item) => item.status !== "cancelado")) {
      mapa.set(plano.data_producao, [...(mapa.get(plano.data_producao) || []), plano])
    }
    return mapa
  }, [planos])
  const reunioesPorDia = useMemo(() => {
    const mapa = new Map<string, ReuniaoAgenda[]>()
    for (const reuniao of reunioes) {
      const chave = chaveIsoLocal(reuniao.inicio)
      mapa.set(chave, [...(mapa.get(chave) || []), reuniao])
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.inicio.localeCompare(b.inicio))
    return mapa
  }, [reunioes])

  const producoesSelecionadas = planosPorDia.get(diaSelecionado) || []
  const reunioesSelecionadas = reunioesPorDia.get(diaSelecionado) || []
  const tituloMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(mes)

  function navegar(direcao: number) {
    const novoMes = new Date(mes.getFullYear(), mes.getMonth() + direcao, 1)
    setMes(novoMes)
    setDiaSelecionado(chaveLocal(novoMes))
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="size-4 text-primary" />Agenda da operação
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Produção planejada e reuniões agendadas em que você foi marcado.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5"><Eye className="size-3.5" />Somente leitura</Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Factory className="size-3.5 text-primary" />Produção</span>
            <span className="flex items-center gap-1"><UsersRound className="size-3.5" />Reunião</span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon-sm" onClick={() => navegar(-1)} aria-label="Mês anterior"><ChevronLeft /></Button>
            <p className="min-w-36 text-center text-sm font-semibold capitalize">{tituloMes}</p>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => navegar(1)} aria-label="Próximo mês"><ChevronRight /></Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 p-3">
        {erroReunioes && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-muted-foreground">
            A produção foi carregada, mas não foi possível carregar as reuniões da sua agenda.
          </p>
        )}
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            <div className="grid grid-cols-7 pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia) => <div key={dia}>{dia}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {dias.map(({ data, chave, pertenceAoMes }) => {
                const producoes = planosPorDia.get(chave) || []
                const reunioesDia = reunioesPorDia.get(chave) || []
                const primeiraProducao = producoes[0]
                const primeiraReuniao = reunioesDia[0]
                const primeiroProduto = primeiraProducao
                  ? produtosPorId.get(primeiraProducao.produto_id)?.nome || "Produção"
                  : ""
                const totalEventos = producoes.length + reunioesDia.length
                const eventosExibidos = Number(Boolean(primeiraProducao)) + Number(Boolean(primeiraReuniao))

                return (
                  <button
                    type="button"
                    key={chave}
                    onClick={() => setDiaSelecionado(chave)}
                    className={cn(
                      "min-h-24 rounded-lg border p-1.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5",
                      chave === diaSelecionado && "border-primary bg-primary/10 ring-1 ring-primary",
                      !pertenceAoMes && "opacity-40",
                    )}
                  >
                    <span className={cn(
                      "inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
                      chave === hoje && "bg-primary text-primary-foreground",
                    )}>
                      {data.getDate()}
                    </span>
                    {primeiraProducao && (
                      <div className="mt-1 rounded bg-primary/15 px-1 py-0.5" title={primeiroProduto}>
                        <span className="line-clamp-1 text-[9px] font-semibold leading-tight text-primary">{primeiroProduto}</span>
                      </div>
                    )}
                    {primeiraReuniao && (
                      <div className="mt-1 rounded bg-muted px-1 py-0.5" title={primeiraReuniao.titulo}>
                        <span className="line-clamp-1 text-[9px] font-semibold leading-tight">{horaReuniao(primeiraReuniao.inicio, null)} · {primeiraReuniao.titulo}</span>
                      </div>
                    )}
                    {totalEventos > eventosExibidos && (
                      <span className="mt-1 block text-[9px] text-muted-foreground">+{totalEventos - eventosExibidos} evento(s)</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-border/70 bg-background/35 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {new Date(`${diaSelecionado}T12:00:00`).toLocaleDateString("pt-BR", { dateStyle: "long" })}
          </p>
          <div className="mt-2 grid max-h-56 gap-2 overflow-auto sm:grid-cols-2">
            {producoesSelecionadas.map((plano) => {
              const produto = produtosPorId.get(plano.produto_id)
              return (
                <div key={`producao-${plano.id}`} className="rounded-lg border border-primary/25 bg-primary/5 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold"><Factory className="size-3.5 text-primary" />{produto?.nome || "Produção"}</p>
                    <Badge variant="secondary" className="text-[9px]">{STATUS[plano.status]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Number(plano.quantidade).toLocaleString("pt-BR")} {produto?.unidade || "un"}
                  </p>
                </div>
              )
            })}

            {reunioesSelecionadas.map((reuniao) => (
              <div key={`reuniao-${reuniao.id}`} className="rounded-lg border border-border/70 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold"><UsersRound className="size-3.5" />{reuniao.titulo}</p>
                  <Badge variant="outline" className="text-[9px]">Reunião</Badge>
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock3 className="size-3" />{horaReuniao(reuniao.inicio, reuniao.fim)}
                </p>
                {reuniao.local && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />{reuniao.local}</p>
                )}
                {reuniao.participante_nomes?.length > 0 && (
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">Com: {reuniao.participante_nomes.join(", ")}</p>
                )}
                {reuniao.link && (
                  <a
                    href={reuniao.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" />Abrir reunião
                  </a>
                )}
              </div>
            ))}

            {producoesSelecionadas.length === 0 && reunioesSelecionadas.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground sm:col-span-2">
                Nenhuma produção ou reunião programada neste dia.
              </p>
            )}
          </div>
        </aside>
      </CardContent>
    </Card>
  )
}
