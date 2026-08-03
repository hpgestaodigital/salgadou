"use client"

import { useEffect, useMemo, useState } from "react"
import { Link2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Produto = { id: string; nome: string; ficha_tecnica_id: string | null; ativo: boolean }
type Ficha = { id: string; nome: string; rendimento_padrao: number; unidade_rendimento: string }
type Necessidade = { data_producao: string; insumo: string; unidade: string; quantidade_necessaria: number; estoque_atual: number; quantidade_a_comprar: number }

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"

export function ChainPlanningMapping() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [necessidades, setNecessidades] = useState<Necessidade[]>([])
  const [produtoId, setProdutoId] = useState("")
  const [fichaId, setFichaId] = useState("")

  async function carregar() {
    setLoading(true)
    const [produtosResult, fichasResult, necessidadesResult] = await Promise.all([
      supabase.from("producao_produtos").select("id,nome,ficha_tecnica_id,ativo").eq("ativo", true).order("nome"),
      supabase.from("producao_fichas_tecnicas").select("id,nome,rendimento_padrao,unidade_rendimento").eq("categoria", "salgado").eq("ativo", true).order("nome"),
      supabase.from("producao_necessidades").select("*").order("data_producao").order("insumo"),
    ])
    const erro = produtosResult.error || fichasResult.error || necessidadesResult.error
    if (erro) toast.error("Não foi possível carregar o cálculo em cadeia.")
    setProdutos((produtosResult.data ?? []) as Produto[])
    setFichas((fichasResult.data ?? []) as Ficha[])
    setNecessidades((necessidadesResult.data ?? []) as Necessidade[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [])

  const vinculados = useMemo(() => produtos.filter((produto) => produto.ficha_tecnica_id), [produtos])
  const datas = useMemo(() => Array.from(new Set(necessidades.map((item) => item.data_producao))), [necessidades])

  async function vincular() {
    if (!produtoId || !fichaId) return toast.error("Selecione o produto e a ficha técnica correspondente.")
    setSaving(true)
    const { error } = await supabase.from("producao_produtos").update({ ficha_tecnica_id: fichaId }).eq("id", produtoId)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Produto ligado à ficha técnica. O planejamento passará a calcular massa, recheio e insumos em cadeia.")
    setProdutoId("")
    setFichaId("")
    await carregar()
  }

  if (loading) return <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando cálculo em cadeia...</div>

  return <Card className="mb-6 border-primary/25">
    <CardHeader>
      <CardTitle>Planejamento por ficha técnica</CardTitle>
      <p className="text-sm text-muted-foreground">Ligue cada produto do calendário à sua ficha de salgado. A necessidade de compras passa a descer pela cadeia salgado → massa/recheio → ingredientes, descontando o estoque intermediário disponível.</p>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <select className={selectClass} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}><option value="">Produto do planejamento</option>{produtos.map((produto) => <option key={produto.id} value={produto.id}>{produto.nome}</option>)}</select>
        <select className={selectClass} value={fichaId} onChange={(e) => setFichaId(e.target.value)}><option value="">Ficha de salgado</option>{fichas.map((ficha) => <option key={ficha.id} value={ficha.id}>{ficha.nome} · rende {ficha.rendimento_padrao} {ficha.unidade_rendimento}</option>)}</select>
        <Button disabled={saving} onClick={vincular}><Link2 className="size-4" />Vincular</Button>
      </div>

      <div className="flex flex-wrap gap-2">{vinculados.length === 0 ? <span className="text-sm text-muted-foreground">Nenhum produto ligado a uma ficha nova.</span> : vinculados.map((produto) => { const ficha = fichas.find((item) => item.id === produto.ficha_tecnica_id); return <Badge key={produto.id} variant="secondary">{produto.nome} → {ficha?.nome ?? "Ficha"}</Badge> })}</div>

      {datas.length > 0 && <div className="space-y-3"><h3 className="font-semibold">Necessidades calculadas</h3>{datas.map((data) => <div key={data} className="rounded-xl border p-3"><p className="mb-2 text-sm font-semibold">{new Date(data + "T12:00:00").toLocaleDateString("pt-BR")}</p><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{necessidades.filter((item) => item.data_producao === data).map((item) => <div key={`${data}-${item.insumo}`} className="rounded-lg bg-muted/30 p-2 text-sm"><div className="flex justify-between gap-3"><span>{item.insumo}</span><strong>{Number(item.quantidade_necessaria).toLocaleString("pt-BR")} {item.unidade}</strong></div><p className="text-xs text-muted-foreground">Estoque: {Number(item.estoque_atual).toLocaleString("pt-BR")} · Comprar: {Number(item.quantidade_a_comprar).toLocaleString("pt-BR")}</p></div>)}</div></div>)}</div>}
    </CardContent>
  </Card>
}
