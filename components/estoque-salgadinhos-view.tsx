"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Boxes, CalendarDays, Clock3, Loader2, PackageCheck, Snowflake } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Produto = { id: string; nome: string; unidade: string }
type StatusLote = "em_congelamento" | "aguardando_empacotamento" | "empacotado" | "encerrado"
type Lote = {
  id: string
  codigo: string
  planejamento_id: string
  produto_id: string
  data_producao: string
  status: StatusLote
  quantidade_planejada: number
  quantidade_saida_maquina: number
  caixas_produzidas: number
  caixas_empacotadas: number
  porcoes_produzidas: number
  porcoes_disponiveis: number
  estimativa_porcoes: number | null
  congelamento_iniciado_em: string | null
  congelado_em: string | null
  observacoes: string | null
  created_at: string
}

const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })

export function EstoqueSalgadinhosView() {
  const supabase = createClient()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    const [produtosResult, lotesResult] = await Promise.all([
      supabase.from("producao_produtos").select("id,nome,unidade").eq("ativo", true).order("nome"),
      supabase.from("producao_lotes").select("*").order("data_producao", { ascending: false }).order("created_at", { ascending: false }),
    ])
    if (produtosResult.error || lotesResult.error) toast.error("Não foi possível carregar o estoque de salgadinhos.")
    setProdutos((produtosResult.data ?? []) as Produto[])
    setLotes((lotesResult.data ?? []) as Lote[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [])

  const emCongelamento = lotes.filter((lote) => lote.status === "em_congelamento")
  const aguardandoEmpacotamento = lotes.filter((lote) => lote.status === "aguardando_empacotamento")
  const disponiveis = lotes.filter((lote) => lote.status === "empacotado" && Number(lote.porcoes_disponiveis) > 0)

  const resumo = useMemo(() => produtos.map((produto) => {
    const lotesProduto = lotes.filter((lote) => lote.produto_id === produto.id)
    return {
      produto,
      congelando: lotesProduto.filter((lote) => lote.status === "em_congelamento").length,
      aguardando: lotesProduto.filter((lote) => lote.status === "aguardando_empacotamento").length,
      porcoesDisponiveis: lotesProduto.reduce((total, lote) => total + Number(lote.porcoes_disponiveis), 0),
      lotesAtivos: lotesProduto.filter((lote) => lote.status !== "encerrado").length,
    }
  }).filter((item) => item.congelando > 0 || item.aguardando > 0 || item.porcoesDisponiveis > 0), [lotes, produtos])

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" />Carregando estoque de salgadinhos...</div>

  return (
    <div className="space-y-6">
      <PageHeader title="Estoque de salgadinhos" description="Veja o que ainda está congelando, o que já pode ser empacotado e o saldo real disponível por lote." />

      <Card className="border-primary/25 bg-primary/[0.035]">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">Estimativa ajuda o planejamento, mas não vira estoque automaticamente.</p><p className="text-sm text-muted-foreground">Somente porções realmente empacotadas entram no saldo disponível. Insumos continuam separados na Produção.</p></div>
          <Button asChild variant="outline"><Link href="/producao?tab=planejamento"><CalendarDays className="size-4" />Abrir produção</Link></Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ResumoGeral titulo="Em congelamento" valor={emCongelamento.length} detalhe="lotes com quantidade estimada" icon={<Snowflake className="size-5 text-sky-400" />} />
        <ResumoGeral titulo="Aguardando empacotamento" valor={aguardandoEmpacotamento.length} detalhe="lotes já congelados" icon={<Clock3 className="size-5 text-amber-400" />} />
        <ResumoGeral titulo="Porções disponíveis" valor={disponiveis.reduce((total, lote) => total + Number(lote.porcoes_disponiveis), 0)} detalhe="saldo real para operação" icon={<PackageCheck className="size-5 text-emerald-400" />} />
        <ResumoGeral titulo="Lotes ativos" valor={lotes.filter((lote) => lote.status !== "encerrado").length} detalhe="rastreáveis individualmente" icon={<Boxes className="size-5" />} />
      </div>

      {resumo.length > 0 && <Card><CardHeader><CardTitle>Resumo por produto</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{resumo.map((item) => <div key={item.produto.id} className="rounded-xl border p-4"><p className="font-semibold">{item.produto.nome}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><Resumo label="Congelando" valor={String(item.congelando)} /><Resumo label="Aguardando" valor={String(item.aguardando)} /><Resumo label="Disponível" valor={`${item.porcoesDisponiveis} porções`} /></div><p className="mt-2 text-xs text-muted-foreground">{item.lotesAtivos} lote(s) ativo(s)</p></div>)}</CardContent></Card>}

      <section className="grid gap-5 xl:grid-cols-3">
        <EtapaCard titulo="Em congelamento" descricao="Saiu da máquina e ainda não está liberado para empacotamento." lotes={emCongelamento} produtos={produtos} vazio="Nenhum lote congelando agora." />
        <EtapaCard titulo="Congelados aguardando empacotamento" descricao="Já terminou o congelamento. A estimativa continua visível até a contagem real." lotes={aguardandoEmpacotamento} produtos={produtos} vazio="Nenhum lote aguardando empacotamento." />
        <EtapaCard titulo="Estoque disponível" descricao="Porções reais já empacotadas e disponíveis por lote." lotes={disponiveis} produtos={produtos} vazio="Nenhum lote com saldo disponível." />
      </section>
    </div>
  )
}

function EtapaCard({ titulo, descricao, lotes, produtos, vazio }: { titulo: string; descricao: string; lotes: Lote[]; produtos: Produto[]; vazio: string }) {
  return <Card><CardHeader><CardTitle>{titulo}</CardTitle><p className="text-sm text-muted-foreground">{descricao}</p></CardHeader><CardContent className="grid gap-3">{lotes.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{vazio}</p> : lotes.map((lote) => <LoteCard key={lote.id} lote={lote} produto={produtos.find((produto) => produto.id === lote.produto_id)} />)}</CardContent></Card>
}

function LoteCard({ lote, produto }: { lote: Lote; produto?: Produto }) {
  const caixasRestantes = Math.max(0, Number(lote.caixas_produzidas) - Number(lote.caixas_empacotadas))
  const statusLabel = lote.status === "em_congelamento" ? "Em congelamento" : lote.status === "aguardando_empacotamento" ? "Aguardando empacotamento" : "Disponível"
  return <div className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{produto?.nome || "Produto"}</p><p className="mt-1 font-mono text-xs text-primary">{lote.codigo}</p></div><Badge variant={lote.status === "empacotado" ? "outline" : "secondary"}>{statusLabel}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Resumo label="Produção" valor={dataCurta.format(new Date(`${lote.data_producao}T12:00:00Z`))} /><Resumo label="Estimativa máquina" valor={`${lote.quantidade_saida_maquina} ${produto?.unidade || "un"}`} /><Resumo label="Caixas restantes" valor={String(caixasRestantes)} /><Resumo label={lote.status === "empacotado" ? "Porções disponíveis" : "Estimativa porções"} valor={lote.status === "empacotado" ? String(lote.porcoes_disponiveis) : lote.estimativa_porcoes ? `≈ ${lote.estimativa_porcoes}` : "Não informada"} /></div>{lote.congelamento_iniciado_em && <p className="mt-2 text-xs text-muted-foreground">Entrada no congelamento: {dataHora.format(new Date(lote.congelamento_iniciado_em))}</p>}{lote.congelado_em && <p className="mt-1 text-xs text-muted-foreground">Congelado em: {dataHora.format(new Date(lote.congelado_em))}</p>}{lote.observacoes && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{lote.observacoes}</p>}</div>
}

function ResumoGeral({ titulo, valor, detalhe, icon }: { titulo: string; valor: number; detalhe: string; icon: React.ReactNode }) {
  return <Card><CardContent className="flex items-start gap-3 p-4"><span className="rounded-lg bg-muted/40 p-2">{icon}</span><div><p className="text-sm text-muted-foreground">{titulo}</p><p className="font-heading text-2xl font-bold">{valor.toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">{detalhe}</p></div></CardContent></Card>
}

function Resumo({ label, valor }: { label: string; valor: string }) {
  return <div className="rounded-lg bg-muted/30 p-2.5"><p className="text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{valor}</p></div>
}
