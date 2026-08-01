"use client"

import { useMemo, useState } from "react"
import { Activity, Search } from "lucide-react"
import { useTable } from "@/lib/use-data"
import type { AcaoAuditoria } from "@/lib/kanban-data"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const AREAS: Record<string, string> = {
  colaboradores: "Colaboradores", motoboys: "Motoboys", fornecedores: "Fornecedores", escala: "Escala semanal",
  pagamentos_fornecedores: "Pagamentos de fornecedores", pagamentos_motoboys: "Pagamentos de motoboys", entregas_motoboy: "Entregas de motoboys",
  kanban_tarefas: "Kanban", reunioes: "Reuniões", reunioes_itens: "Backlog de reuniões", contratos: "Contratos",
  contrato_validacoes: "Validação de contratos", contrato_signatarios: "Assinaturas", documentos_juridicos: "Documentos jurídicos", demandas_juridicas: "Demandas jurídicas",
}
const ACAO: Record<AcaoAuditoria["acao"], string> = { criou: "Criou", alterou: "Alterou", excluiu: "Excluiu" }

export function HistoricoView() {
  const { data: acoes, error, isLoading } = useTable<AcaoAuditoria>("auditoria_acoes", { column: "ocorrido_em", ascending: false })
  const [busca, setBusca] = useState("")
  const [area, setArea] = useState("todas")
  const visiveis = useMemo(() => acoes.filter((acao) => {
    if (area !== "todas" && acao.tabela !== area) return false
    const termo = busca.trim().toLocaleLowerCase("pt-BR")
    return !termo || [acao.usuario_nome, acao.registro_titulo, AREAS[acao.tabela]].some((valor) => valor?.toLocaleLowerCase("pt-BR").includes(termo))
  }), [acoes, area, busca])

  return <div>
    <PageHeader title="Histórico de ações" description="Veja quem criou, alterou ou excluiu registros nas áreas do ERP." />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar usuário, registro ou área" /></div>
      <Select value={area} onValueChange={(valor) => setArea(valor ?? "todas")}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas as áreas</SelectItem>{Object.entries(AREAS).map(([valor, nome]) => <SelectItem key={valor} value={valor}>{nome}</SelectItem>)}</SelectContent></Select>
    </div>
    {error ? <Card className="border-destructive/40"><CardContent className="py-6 text-sm">Aplique a atualização do histórico de ações no Supabase para habilitar esta área.</CardContent></Card> : isLoading ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando histórico...</CardContent></Card> : acoes.length === 0 ? <Card><CardContent className="py-12 text-center"><Activity className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-semibold">O histórico começa a partir de agora</p><p className="mt-1 text-sm text-muted-foreground">As próximas inclusões, alterações e exclusões serão identificadas pelo usuário conectado.</p></CardContent></Card> : visiveis.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma ação corresponde aos filtros.</CardContent></Card> : <div className="space-y-2">{visiveis.map((acao) => <Card key={acao.id}><CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant={acao.acao === "excluiu" ? "destructive" : "outline"}>{ACAO[acao.acao]}</Badge><span className="text-sm font-semibold">{AREAS[acao.tabela] ?? acao.tabela}</span></div><p className="mt-2 truncate text-sm">{acao.registro_titulo || "Registro sem título"}</p><p className="mt-1 text-xs text-muted-foreground">Por {acao.usuario_nome}</p></div><time className="shrink-0 text-xs text-muted-foreground" dateTime={acao.ocorrido_em}>{new Date(acao.ocorrido_em).toLocaleString("pt-BR")}</time></CardContent></Card>)}</div>}
  </div>
}
