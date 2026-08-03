"use client"

import { useEffect, useState } from "react"
import { Loader2, MinusCircle, PlusCircle } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Ficha = { id: string; nome: string }
type Estoque = { ficha_id: string; nome: string; grandes_disponiveis: number; pequenas_disponiveis: number; ultima_producao: string | null }
type Movimento = { id: string; ficha_id: string; tamanho: string; tipo: string; quantidade: number; motivo: string; data_movimentacao: string; created_at: string }
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
const formatarQuantidade = (valor: number) => Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 })

export function SauceStockControl() {
  const supabase = createClient()
  const hoje = new Date().toISOString().slice(0, 10)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [estoques, setEstoques] = useState<Estoque[]>([])
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [producao, setProducao] = useState({ ficha_id: "", receitas: "1", grandes: "", pequenas: "", data: hoje, observacoes: "" })
  const [saida, setSaida] = useState({ ficha_id: "", tamanho: "grande", quantidade: "", motivo: "vendido", data: hoje, observacoes: "" })

  async function carregar() {
    setLoading(true)
    const [fichasResult, estoquesResult, movimentosResult] = await Promise.all([
      supabase.from("producao_fichas_tecnicas").select("id,nome").eq("categoria", "molho").eq("ativo", true).order("nome"),
      supabase.from("producao_estoque_molhos").select("*").order("nome"),
      supabase.from("producao_molho_movimentacoes").select("id,ficha_id,tamanho,tipo,quantidade,motivo,data_movimentacao,created_at").order("created_at", { ascending: false }).limit(40),
    ])
    const erro = fichasResult.error || estoquesResult.error || movimentosResult.error
    if (erro) toast.error("Não foi possível carregar o estoque de molhos.")
    setFichas((fichasResult.data ?? []) as Ficha[])
    setEstoques((estoquesResult.data ?? []) as Estoque[])
    setMovimentos((movimentosResult.data ?? []) as Movimento[])
    setLoading(false)
  }
  useEffect(() => { void carregar() }, [])

  async function registrarProducao() {
    if (!producao.ficha_id || Number(producao.receitas) <= 0 || Number(producao.grandes || 0) + Number(producao.pequenas || 0) <= 0) return toast.error("Informe molho, receitas e bisnagas produzidas.")
    setSaving(true)
    const { error } = await supabase.rpc("registrar_producao_molho", { ficha_id_param: producao.ficha_id, receitas_param: Number(producao.receitas), data_param: producao.data, grandes_param: Number(producao.grandes || 0), pequenas_param: Number(producao.pequenas || 0), observacoes_param: producao.observacoes || null })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Produção registrada e ingredientes baixados.")
    setProducao({ ficha_id: "", receitas: "1", grandes: "", pequenas: "", data: hoje, observacoes: "" })
    await carregar()
  }

  async function registrarSaida() {
    if (!saida.ficha_id || Number(saida.quantidade) <= 0) return toast.error("Informe molho e quantidade maior que zero.")
    setSaving(true)
    const { error } = await supabase.rpc("registrar_saida_molho", { ficha_id_param: saida.ficha_id, tamanho_param: saida.tamanho, quantidade_param: Number(saida.quantidade), motivo_param: saida.motivo, data_param: saida.data, observacoes_param: saida.observacoes || null })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Saída registrada pelos lotes mais antigos.")
    setSaida({ ficha_id: "", tamanho: "grande", quantidade: "", motivo: "vendido", data: hoje, observacoes: "" })
    await carregar()
  }

  if (loading) return <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando molhos...</div>

  return <div className="space-y-5">
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-primary/25"><CardHeader><CardTitle>Produção de molho</CardTitle><p className="text-sm text-muted-foreground">Baixa os ingredientes da ficha e cria lotes de bisnagas.</p></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2"><Label>Molho</Label><select className={selectClass} value={producao.ficha_id} onChange={(e) => setProducao({ ...producao, ficha_id: e.target.value })}><option value="">Selecione</option>{fichas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
        <div><Label>Receitas</Label><Input type="number" min="0.1" step="0.1" value={producao.receitas} onChange={(e) => setProducao({ ...producao, receitas: e.target.value })} /></div><div><Label>Data</Label><Input type="date" value={producao.data} onChange={(e) => setProducao({ ...producao, data: e.target.value })} /></div>
        <div><Label>Bisnagas grandes</Label><Input type="number" min="0" step="1" value={producao.grandes} onChange={(e) => setProducao({ ...producao, grandes: e.target.value })} /></div><div><Label>Bisnagas pequenas</Label><Input type="number" min="0" step="1" value={producao.pequenas} onChange={(e) => setProducao({ ...producao, pequenas: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>Observações</Label><Input value={producao.observacoes} onChange={(e) => setProducao({ ...producao, observacoes: e.target.value })} /></div><Button className="md:col-span-2" disabled={saving} onClick={registrarProducao}><PlusCircle className="size-4" />Registrar produção</Button>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Saída de molho</CardTitle><p className="text-sm text-muted-foreground">Venda, perda, vencimento, consumo interno ou ajuste com baixa FIFO. Aceita frações, como 0,5 bisnaga.</p></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2"><Label>Molho</Label><select className={selectClass} value={saida.ficha_id} onChange={(e) => setSaida({ ...saida, ficha_id: e.target.value })}><option value="">Selecione</option>{fichas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
        <div><Label>Bisnaga</Label><select className={selectClass} value={saida.tamanho} onChange={(e) => setSaida({ ...saida, tamanho: e.target.value })}><option value="grande">Grande</option><option value="pequena">Pequena</option></select></div><div><Label>Quantidade</Label><Input type="number" min="0.1" step="0.1" inputMode="decimal" placeholder="Ex.: 0,5" value={saida.quantidade} onChange={(e) => setSaida({ ...saida, quantidade: e.target.value })} /></div>
        <div><Label>Motivo</Label><select className={selectClass} value={saida.motivo} onChange={(e) => setSaida({ ...saida, motivo: e.target.value })}><option value="vendido">Venda</option><option value="perda">Perda</option><option value="vencimento">Vencimento</option><option value="consumo interno">Consumo interno</option><option value="ajuste">Ajuste</option></select></div><div><Label>Data</Label><Input type="date" value={saida.data} onChange={(e) => setSaida({ ...saida, data: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>Observações</Label><Input value={saida.observacoes} onChange={(e) => setSaida({ ...saida, observacoes: e.target.value })} /></div><Button className="md:col-span-2" variant="outline" disabled={saving} onClick={registrarSaida}><MinusCircle className="size-4" />Registrar saída</Button>
      </CardContent></Card>
    </div>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{estoques.map((e) => <Card key={e.ficha_id}><CardHeader><CardTitle>{e.nome}</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2"><Badge>Grandes: {formatarQuantidade(e.grandes_disponiveis)}</Badge><Badge variant="secondary">Pequenas: {formatarQuantidade(e.pequenas_disponiveis)}</Badge></CardContent></Card>)}</div>

    <Card><CardHeader><CardTitle>Últimas movimentações de molho</CardTitle></CardHeader><CardContent className="space-y-2">{movimentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma movimentação.</p> : movimentos.map((m) => <div key={m.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"><div><strong>{fichas.find((f) => f.id === m.ficha_id)?.nome ?? "Molho"}</strong><p className="text-muted-foreground">{m.motivo} · Bisnaga {m.tamanho}</p></div><div className="text-right"><strong>{m.tipo === "saida" ? "-" : "+"}{formatarQuantidade(m.quantidade)}</strong><p className="text-muted-foreground">{new Date(m.data_movimentacao + "T12:00:00").toLocaleDateString("pt-BR")}</p></div></div>)}</CardContent></Card>
  </div>
}
