"use client"

import { useEffect, useState } from "react"
import { Edit3, Loader2, Plus, Save } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Insumo = { id: string; nome: string; unidade: string; estoque_atual: number; estoque_minimo: number; controla_estoque: boolean; custo_unitario: number; ativo: boolean }
type Produto = { id: string; nome: string; unidade: string; ativo: boolean; ficha_tecnica_id: string | null }
type Ficha = { id: string; nome: string }
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"

export function ProductionRegisters() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [insumoId, setInsumoId] = useState<string | null>(null)
  const [produtoId, setProdutoId] = useState<string | null>(null)
  const [insumo, setInsumo] = useState({ nome: "", unidade: "kg", estoque: "0", minimo: "0", custo: "0", controla: true, ativo: true })
  const [produto, setProduto] = useState({ nome: "", unidade: "un", ficha_id: "", ativo: true })

  async function carregar() {
    setLoading(true)
    const [i, p, f] = await Promise.all([
      supabase.from("producao_insumos").select("*").order("nome"),
      supabase.from("producao_produtos").select("id,nome,unidade,ativo,ficha_tecnica_id").order("nome"),
      supabase.from("producao_fichas_tecnicas").select("id,nome").eq("categoria", "salgado").eq("ativo", true).order("nome"),
    ])
    if (i.error || p.error || f.error) toast.error("Não foi possível carregar os cadastros.")
    setInsumos((i.data ?? []) as Insumo[]); setProdutos((p.data ?? []) as Produto[]); setFichas((f.data ?? []) as Ficha[]); setLoading(false)
  }
  useEffect(() => { void carregar() }, [])

  function editarInsumo(item: Insumo) { setInsumoId(item.id); setInsumo({ nome: item.nome, unidade: item.unidade, estoque: String(item.estoque_atual), minimo: String(item.estoque_minimo), custo: String(item.custo_unitario), controla: item.controla_estoque, ativo: item.ativo }) }
  function editarProduto(item: Produto) { setProdutoId(item.id); setProduto({ nome: item.nome, unidade: item.unidade, ficha_id: item.ficha_tecnica_id ?? "", ativo: item.ativo }) }

  async function salvarInsumo() {
    if (!insumo.nome.trim()) return toast.error("Informe o nome do insumo.")
    setSaving(true)
    if (insumoId) {
      const atual = insumos.find((i) => i.id === insumoId)
      const { error } = await supabase.from("producao_insumos").update({ nome: insumo.nome.trim(), unidade: insumo.unidade, estoque_minimo: Number(insumo.minimo || 0), custo_unitario: Number(insumo.custo || 0), controla_estoque: insumo.controla, ativo: insumo.ativo, updated_at: new Date().toISOString() }).eq("id", insumoId)
      if (error) { setSaving(false); return toast.error(error.message) }
      if (atual && Number(insumo.estoque) !== Number(atual.estoque_atual)) {
        const ajuste = await supabase.rpc("ajustar_estoque_insumo", { insumo_id_param: insumoId, novo_saldo_param: Number(insumo.estoque), motivo_param: "Alteração pelo cadastro de insumos", observacoes_param: null })
        if (ajuste.error) { setSaving(false); return toast.error(ajuste.error.message) }
      }
    } else {
      const { data, error } = await supabase.from("producao_insumos").insert({ nome: insumo.nome.trim(), unidade: insumo.unidade, estoque_atual: 0, estoque_minimo: Number(insumo.minimo || 0), custo_unitario: Number(insumo.custo || 0), controla_estoque: insumo.controla, ativo: true }).select("id").single()
      if (error) { setSaving(false); return toast.error(error.message) }
      if (Number(insumo.estoque) > 0) {
        const entrada = await supabase.rpc("registrar_entrada_estoque", { insumo_id_param: data.id, quantidade_param: Number(insumo.estoque), motivo_param: "Saldo inicial", observacoes_param: null })
        if (entrada.error) { setSaving(false); return toast.error(entrada.error.message) }
      }
    }
    setSaving(false); toast.success("Insumo salvo."); setInsumoId(null); setInsumo({ nome: "", unidade: "kg", estoque: "0", minimo: "0", custo: "0", controla: true, ativo: true }); await carregar()
  }

  async function salvarProduto() {
    if (!produto.nome.trim()) return toast.error("Informe o nome do produto.")
    setSaving(true)
    const payload = { nome: produto.nome.trim(), unidade: produto.unidade, ficha_tecnica_id: produto.ficha_id || null, ativo: produto.ativo }
    const { error } = produtoId ? await supabase.from("producao_produtos").update(payload).eq("id", produtoId) : await supabase.from("producao_produtos").insert(payload)
    setSaving(false); if (error) return toast.error(error.message)
    toast.success("Produto salvo e disponível para o planejamento."); setProdutoId(null); setProduto({ nome: "", unidade: "un", ficha_id: "", ativo: true }); await carregar()
  }

  if (loading) return <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando cadastros...</div>
  return <div className="space-y-6">
    <PageHeader title="Cadastros da Produção" description="Insumos controlados, custos, produtos finais e vínculo com as fichas técnicas." />
    <div className="grid gap-5 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>{insumoId ? "Editar insumo" : "Novo insumo"}</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2"><Input placeholder="Nome" value={insumo.nome} onChange={(e) => setInsumo({ ...insumo, nome: e.target.value })} /><select className={selectClass} value={insumo.unidade} onChange={(e) => setInsumo({ ...insumo, unidade: e.target.value })}><option>kg</option><option>g</option><option>l</option><option>ml</option><option>un</option></select><div><Label>Saldo atual</Label><Input type="number" step="0.001" value={insumo.estoque} onChange={(e) => setInsumo({ ...insumo, estoque: e.target.value })} /></div><div><Label>Estoque mínimo</Label><Input type="number" step="0.001" value={insumo.minimo} onChange={(e) => setInsumo({ ...insumo, minimo: e.target.value })} /></div><div><Label>Custo por unidade de controle</Label><Input type="number" step="0.0001" value={insumo.custo} onChange={(e) => setInsumo({ ...insumo, custo: e.target.value })} /></div><label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" checked={insumo.controla} onChange={(e) => setInsumo({ ...insumo, controla: e.target.checked })} />Controlar estoque e compras</label></div>
        <Button disabled={saving} onClick={salvarInsumo}><Save className="size-4" />Salvar insumo</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{produtoId ? "Editar produto" : "Novo produto final"}</CardTitle></CardHeader><CardContent className="space-y-3">
        <Input placeholder="Nome do produto" value={produto.nome} onChange={(e) => setProduto({ ...produto, nome: e.target.value })} /><div className="grid gap-3 md:grid-cols-2"><select className={selectClass} value={produto.unidade} onChange={(e) => setProduto({ ...produto, unidade: e.target.value })}><option value="un">unidade</option><option value="porcao">porção</option><option value="caixa">caixa</option></select><select className={selectClass} value={produto.ficha_id} onChange={(e) => setProduto({ ...produto, ficha_id: e.target.value })}><option value="">Sem ficha vinculada</option>{fichas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={produto.ativo} onChange={(e) => setProduto({ ...produto, ativo: e.target.checked })} />Produto ativo</label><Button disabled={saving} onClick={salvarProduto}><Plus className="size-4" />Salvar produto</Button>
      </CardContent></Card>
    </div>
    <div className="grid gap-5 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Insumos cadastrados</CardTitle></CardHeader><CardContent className="space-y-2">{insumos.map((i) => <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><strong>{i.nome}</strong><p className="text-muted-foreground">Saldo {i.estoque_atual} {i.unidade} · mínimo {i.estoque_minimo} · custo R$ {Number(i.custo_unitario).toFixed(4)}</p></div><div className="flex items-center gap-2"><Badge variant={i.controla_estoque ? "secondary" : "outline"}>{i.controla_estoque ? "controlado" : "informativo"}</Badge><Button size="icon" variant="ghost" onClick={() => editarInsumo(i)}><Edit3 className="size-4" /></Button></div></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Produtos do planejamento</CardTitle></CardHeader><CardContent className="space-y-2">{produtos.map((p) => <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><strong>{p.nome}</strong><p className="text-muted-foreground">{p.unidade} · {p.ficha_tecnica_id ? `Ficha: ${fichas.find((f) => f.id === p.ficha_tecnica_id)?.nome ?? "vinculada"}` : "sem ficha"}</p></div><Button size="icon" variant="ghost" onClick={() => editarProduto(p)}><Edit3 className="size-4" /></Button></div>)}</CardContent></Card>
    </div>
  </div>
}
