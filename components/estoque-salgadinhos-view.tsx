"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Boxes, CalendarDays, Clock3, History, Loader2, PackageCheck, Save, Snowflake } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
type Movimentacao = {
  id: string
  produto_id: string
  lote_id: string
  motivo: "vendido" | "perda" | "consumo_interno" | "ajuste"
  unidade_informada: "porcao" | "unidade"
  quantidade_informada: number
  unidades_por_porcao: number | null
  porcoes_baixadas: number
  saldo_anterior: number
  saldo_posterior: number
  data_movimentacao: string
  observacoes: string | null
  created_at: string
}

const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
const hoje = new Date().toISOString().slice(0, 10)

export function EstoqueSalgadinhosView() {
  const supabase = createClient()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [retirada, setRetirada] = useState({ produto_id: "", lote_id: "", quantidade: "", unidade: "porcao", unidades_por_porcao: "25", motivo: "vendido", data: hoje, observacoes: "" })

  async function carregar() {
    setLoading(true)
    const [produtosResult, lotesResult, movimentacoesResult] = await Promise.all([
      supabase.from("producao_produtos").select("id,nome,unidade").eq("ativo", true).order("nome"),
      supabase.from("producao_lotes").select("*").order("data_producao", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("producao_movimentacoes_salgadinhos").select("*").order("data_movimentacao", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    ])
    if (produtosResult.error || lotesResult.error || movimentacoesResult.error) toast.error("Não foi possível carregar o estoque de salgadinhos.")
    setProdutos((produtosResult.data ?? []) as Produto[])
    setLotes((lotesResult.data ?? []) as Lote[])
    setMovimentacoes((movimentacoesResult.data ?? []) as Movimentacao[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [])

  const emCongelamento = lotes.filter((lote) => lote.status === "em_congelamento")
  const aguardandoEmpacotamento = lotes.filter((lote) => lote.status === "aguardando_empacotamento")
  const disponiveis = lotes.filter((lote) => lote.status === "empacotado" && Number(lote.porcoes_disponiveis) > 0)
  const lotesRetirada = disponiveis.filter((lote) => lote.produto_id === retirada.produto_id)
  const saldoProduto = lotesRetirada.reduce((total, lote) => total + Number(lote.porcoes_disponiveis), 0)

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

  async function registrarRetirada() {
    const quantidade = Number(retirada.quantidade)
    const unidadesPorPorcao = Number(retirada.unidades_por_porcao)
    if (!retirada.produto_id) return toast.error("Selecione o produto.")
    if (!Number.isFinite(quantidade) || quantidade <= 0) return toast.error("Informe uma quantidade válida.")
    if (retirada.unidade === "unidade" && (!Number.isFinite(unidadesPorPorcao) || unidadesPorPorcao <= 0)) return toast.error("Informe quantas unidades formam uma porção.")

    setSaving(true)
    const { error } = await supabase.rpc("registrar_retirada_salgadinhos", {
      produto_id_param: retirada.produto_id,
      lote_id_param: retirada.lote_id || null,
      quantidade_param: quantidade,
      unidade_param: retirada.unidade,
      unidades_por_porcao_param: retirada.unidade === "unidade" ? unidadesPorPorcao : null,
      motivo_param: retirada.motivo,
      data_param: retirada.data,
      observacoes_param: retirada.observacoes.trim() || null,
    })
    setSaving(false)
    if (error) return toast.error(error.message || "Não foi possível registrar a retirada.")

    toast.success("Retirada registrada e estoque atualizado.")
    setRetirada((atual) => ({ ...atual, lote_id: "", quantidade: "", observacoes: "" }))
    await carregar()
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" />Carregando estoque de salgadinhos...</div>

  return (
    <div className="space-y-6">
      <PageHeader title="Estoque de salgadinhos" description="Acompanhe produção, saldo disponível e retiradas manuais por venda, perda, consumo ou ajuste." />

      <Card className="border-primary/25 bg-primary/[0.035]">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">Estimativa ajuda o planejamento, mas não vira estoque automaticamente.</p><p className="text-sm text-muted-foreground">Somente porções empacotadas entram no saldo. As saídas agora podem ser registradas manualmente até a integração com a Saipos.</p></div>
          <Button asChild variant="outline"><Link href="/producao?tab=planejamento"><CalendarDays className="size-4" />Abrir produção</Link></Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ResumoGeral titulo="Em congelamento" valor={emCongelamento.length} detalhe="lotes com quantidade estimada" icon={<Snowflake className="size-5 text-sky-400" />} />
        <ResumoGeral titulo="Aguardando empacotamento" valor={aguardandoEmpacotamento.length} detalhe="lotes já congelados" icon={<Clock3 className="size-5 text-amber-400" />} />
        <ResumoGeral titulo="Porções disponíveis" valor={disponiveis.reduce((total, lote) => total + Number(lote.porcoes_disponiveis), 0)} detalhe="saldo após entradas e retiradas" icon={<PackageCheck className="size-5 text-emerald-400" />} />
        <ResumoGeral titulo="Lotes ativos" valor={lotes.filter((lote) => lote.status !== "encerrado").length} detalhe="rastreáveis individualmente" icon={<Boxes className="size-5" />} />
      </div>

      <Card>
        <CardHeader><CardTitle>Registrar retirada manual</CardTitle><p className="text-sm text-muted-foreground">Sem escolher lote, a baixa acontece automaticamente nos lotes mais antigos. O sistema bloqueia saldo negativo.</p></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2"><Label>Produto</Label><select className={selectClass} value={retirada.produto_id} onChange={(e) => setRetirada((a) => ({ ...a, produto_id: e.target.value, lote_id: "" }))}><option value="">Selecione</option>{produtos.map((produto) => <option key={produto.id} value={produto.id}>{produto.nome}</option>)}</select>{retirada.produto_id && <p className="text-xs text-muted-foreground">Saldo: {saldoProduto.toLocaleString("pt-BR")} porções</p>}</div>
          <div className="space-y-2"><Label>Lote (opcional)</Label><select className={selectClass} value={retirada.lote_id} onChange={(e) => setRetirada((a) => ({ ...a, lote_id: e.target.value }))}><option value="">Automático — mais antigos primeiro</option>{lotesRetirada.map((lote) => <option key={lote.id} value={lote.id}>{lote.codigo} — {Number(lote.porcoes_disponiveis).toLocaleString("pt-BR")} porções</option>)}</select></div>
          <div className="space-y-2"><Label>Quantidade</Label><div className="flex gap-2"><Input type="number" min="0.01" step="0.01" value={retirada.quantidade} onChange={(e) => setRetirada((a) => ({ ...a, quantidade: e.target.value }))} /><select className={`${selectClass} w-32`} value={retirada.unidade} onChange={(e) => setRetirada((a) => ({ ...a, unidade: e.target.value }))}><option value="porcao">Porções</option><option value="unidade">Unidades</option></select></div></div>
          {retirada.unidade === "unidade" && <div className="space-y-2"><Label>Unidades por porção</Label><Input type="number" min="1" step="1" value={retirada.unidades_por_porcao} onChange={(e) => setRetirada((a) => ({ ...a, unidades_por_porcao: e.target.value }))} /><p className="text-xs text-muted-foreground">Usado para converter unidades em saldo de porções.</p></div>}
          <div className="space-y-2"><Label>Motivo</Label><select className={selectClass} value={retirada.motivo} onChange={(e) => setRetirada((a) => ({ ...a, motivo: e.target.value }))}><option value="vendido">Vendido</option><option value="perda">Perda</option><option value="consumo_interno">Consumo interno</option><option value="ajuste">Ajuste</option></select></div>
          <div className="space-y-2"><Label>Data</Label><Input type="date" value={retirada.data} onChange={(e) => setRetirada((a) => ({ ...a, data: e.target.value }))} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Observações</Label><Input value={retirada.observacoes} onChange={(e) => setRetirada((a) => ({ ...a, observacoes: e.target.value }))} placeholder="Ex.: fechamento das vendas do dia" /></div>
          <div className="md:col-span-2 xl:col-span-4"><Button onClick={() => void registrarRetirada()} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Registrar retirada</Button></div>
        </CardContent>
      </Card>

      {resumo.length > 0 && <Card><CardHeader><CardTitle>Resumo por produto</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{resumo.map((item) => <div key={item.produto.id} className="rounded-xl border p-4"><p className="font-semibold">{item.produto.nome}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><Resumo label="Congelando" valor={String(item.congelando)} /><Resumo label="Aguardando" valor={String(item.aguardando)} /><Resumo label="Disponível" valor={`${item.porcoesDisponiveis} porções`} /></div><p className="mt-2 text-xs text-muted-foreground">{item.lotesAtivos} lote(s) ativo(s)</p></div>)}</CardContent></Card>}

      <section className="grid gap-5 xl:grid-cols-3">
        <EtapaCard titulo="Em congelamento" descricao="Saiu da máquina e ainda não está liberado para empacotamento." lotes={emCongelamento} produtos={produtos} vazio="Nenhum lote congelando agora." />
        <EtapaCard titulo="Congelados aguardando empacotamento" descricao="Já terminou o congelamento. A estimativa continua visível até a contagem real." lotes={aguardandoEmpacotamento} produtos={produtos} vazio="Nenhum lote aguardando empacotamento." />
        <EtapaCard titulo="Estoque disponível" descricao="Porções reais após as entradas e retiradas registradas." lotes={disponiveis} produtos={produtos} vazio="Nenhum lote com saldo disponível." />
      </section>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-5" />Histórico de retiradas</CardTitle><p className="text-sm text-muted-foreground">Últimas 100 baixas, incluindo o lote afetado e o saldo depois da movimentação.</p></CardHeader>
        <CardContent className="space-y-3">
          {movimentacoes.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma retirada registrada.</p>}
          {movimentacoes.map((mov) => {
            const produto = produtos.find((p) => p.id === mov.produto_id)
            const lote = lotes.find((l) => l.id === mov.lote_id)
            const motivo = mov.motivo === "vendido" ? "Vendido" : mov.motivo === "perda" ? "Perda" : mov.motivo === "consumo_interno" ? "Consumo interno" : "Ajuste"
            return <div key={mov.id} className="flex flex-col gap-2 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"><div><p className="font-semibold">{produto?.nome || "Produto"} · {motivo}</p><p className="text-xs text-muted-foreground">{dataCurta.format(new Date(`${mov.data_movimentacao}T12:00:00Z`))} · lote {lote?.codigo || "não localizado"}{mov.observacoes ? ` · ${mov.observacoes}` : ""}</p></div><div className="text-sm md:text-right"><p className="font-semibold">-{Number(mov.quantidade_informada).toLocaleString("pt-BR")} {mov.unidade_informada === "porcao" ? "porções" : "unidades"}</p><p className="text-xs text-muted-foreground">Baixa equivalente: {Number(mov.porcoes_baixadas).toLocaleString("pt-BR")} porções · saldo do lote: {Number(mov.saldo_posterior).toLocaleString("pt-BR")}</p></div></div>
          })}
        </CardContent>
      </Card>
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
