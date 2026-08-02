"use client"

import { useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Eye } from "lucide-react"
import { useTable } from "@/lib/use-data"
import { todayISO } from "@/lib/format"
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

const STATUS: Record<PlanoProducao["status"], string> = {
  planejado: "Planejado",
  em_producao: "Em produção",
  concluido: "Concluído",
  cancelado: "Cancelado",
}

function chaveLocal(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`
}

export function DashboardProductionCalendar() {
  const hoje = todayISO()
  const dataHoje = new Date(`${hoje}T12:00:00`)
  const [mes, setMes] = useState(() => new Date(dataHoje.getFullYear(), dataHoje.getMonth(), 1))
  const [diaSelecionado, setDiaSelecionado] = useState(hoje)
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

  const produtosPorId = useMemo(() => new Map(produtos.map((produto) => [produto.id, produto])), [produtos])
  const planosPorDia = useMemo(() => {
    const mapa = new Map<string, PlanoProducao[]>()
    for (const plano of planos.filter((item) => item.status !== "cancelado")) {
      mapa.set(plano.data_producao, [...(mapa.get(plano.data_producao) || []), plano])
    }
    return mapa
  }, [planos])
  const selecionados = planosPorDia.get(diaSelecionado) || []
  const tituloMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(mes)

  function navegar(direcao: number) {
    const novoMes = new Date(mes.getFullYear(), mes.getMonth() + direcao, 1)
    setMes(novoMes)
    setDiaSelecionado(chaveLocal(novoMes))
  }

  return <Card className="overflow-hidden">
    <CardHeader className="border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="size-4 text-primary" />Calendário da produção</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">Agenda definida pela equipe responsável pela Produção.</p></div>
        <Badge variant="outline" className="gap-1.5"><Eye className="size-3.5" />Somente leitura</Badge>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 sm:justify-end">
        <Button type="button" variant="outline" size="icon-sm" onClick={() => navegar(-1)} aria-label="Mês anterior"><ChevronLeft /></Button>
        <p className="min-w-36 text-center text-sm font-semibold capitalize">{tituloMes}</p>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => navegar(1)} aria-label="Próximo mês"><ChevronRight /></Button>
      </div>
    </CardHeader>
    <CardContent className="grid gap-3 p-3">
      <div className="overflow-x-auto"><div className="min-w-[420px]">
        <div className="grid grid-cols-7 pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia) => <div key={dia}>{dia}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">{dias.map(({ data, chave, pertenceAoMes }) => {
          const producoes = planosPorDia.get(chave) || []
          const primeiraProducao = producoes[0]
          const primeiroProduto = primeiraProducao ? produtosPorId.get(primeiraProducao.produto_id)?.nome || "Produção" : ""
          return <button type="button" key={chave} onClick={() => setDiaSelecionado(chave)} className={cn("aspect-square rounded-lg border p-1.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5", chave === diaSelecionado && "border-primary bg-primary/10 ring-1 ring-primary", !pertenceAoMes && "opacity-40")}>
            <span className={cn("inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold", chave === hoje && "bg-primary text-primary-foreground")}>{data.getDate()}</span>
            {primeiraProducao && <div className="mt-1 rounded bg-primary/15 px-1 py-0.5" title={primeiroProduto}><span className="line-clamp-2 text-[10px] font-semibold leading-tight text-primary">{primeiroProduto}</span>{producoes.length > 1 && <span className="mt-0.5 block text-[9px] text-primary/80">+{producoes.length - 1}</span>}</div>}
          </button>
        })}</div>
      </div></div>
      <aside className="rounded-lg border border-border/70 bg-background/35 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{new Date(`${diaSelecionado}T12:00:00`).toLocaleDateString("pt-BR", { dateStyle: "long" })}</p>
        <div className="mt-2 grid max-h-32 gap-2 overflow-auto sm:grid-cols-2">{selecionados.length ? selecionados.map((plano) => {
          const produto = produtosPorId.get(plano.produto_id)
          return <div key={plano.id} className="rounded-lg border border-border/70 p-2.5"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{produto?.nome || "Produção"}</p><Badge variant="secondary" className="text-[9px]">{STATUS[plano.status]}</Badge></div><p className="mt-0.5 text-xs text-muted-foreground">{Number(plano.quantidade).toLocaleString("pt-BR")} {produto?.unidade || "un"}</p></div>
        }) : <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhuma produção programada neste dia.</p>}</div>
      </aside>
    </CardContent>
  </Card>
}
