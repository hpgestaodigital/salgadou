"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Beaker, Loader2, Plus, Save, Soup, Wheat } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Categoria = "salgado" | "massa" | "recheio" | "molho"
type Ficha = { id: string; nome: string; categoria: Categoria; unidade_rendimento: string; rendimento_padrao: number; observacoes: string | null; ativo: boolean }
type Insumo = { id: string; nome: string; unidade: string; estoque_atual: number; ativo: boolean }
type Item = { id: string; ficha_id: string; insumo_id: string | null; componente_ficha_id: string | null; quantidade: number; unidade: string }
type LoteMolho = { id: string; ficha_id: string; codigo: string; data_producao: string; receitas_produzidas: number; rendimento_esperado: number; bisnagas_grandes_disponiveis: number; bisnagas_pequenas_disponiveis: number; created_at: string }

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
const categorias: { id: Categoria; label: string }[] = [
  { id: "salgado", label: "Salgados" },
  { id: "massa", label: "Massas" },
  { id: "recheio", label: "Recheios" },
  { id: "molho", label: "Molhos" },
]

export function ReceitasView() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [lotes, setLotes] = useState<LoteMolho[]>([])
  const [categoria, setCategoria] = useState<Categoria>("salgado")
  const [novaFicha, setNovaFicha] = useState({ nome: "", unidade: "un", rendimento: "", observacoes: "" })
  const [novoItem, setNovoItem] = useState({ ficha_id: "", tipo: "insumo", referencia_id: "", quantidade: "", unidade: "g" })
  const hoje = new Date().toISOString().slice(0, 10)
  const [producaoMolho, setProducaoMolho] = useState({ ficha_id: "", data: hoje, receitas: "1", grandes: "", pequenas: "", observacoes: "" })

  async function carregar() {
    setLoading(true)
    const [fichasResult, insumosResult, itensResult, lotesResult] = await Promise.all([
      supabase.from("producao_fichas_tecnicas").select("*").eq("ativo", true).order("nome"),
      supabase.from("producao_insumos").select("id,nome,unidade,estoque_atual,ativo").eq("ativo", true).order("nome"),
      supabase.from("producao_ficha_itens").select("*").order("created_at"),
      supabase.from("producao_molho_lotes").select("*").order("data_producao", { ascending: false }).limit(50),
    ])
    if ([fichasResult, insumosResult, itensResult, lotesResult].some((r) => r.error)) toast.error("Não foi possível carregar as fichas técnicas.")
    setFichas((fichasResult.data ?? []) as Ficha[])
    setInsumos((insumosResult.data ?? []) as Insumo[])
    setItens((itensResult.data ?? []) as Item[])
    setLotes((lotesResult.data ?? []) as LoteMolho[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [])

  const fichasCategoria = useMemo(() => fichas.filter((f) => f.categoria === categoria), [fichas, categoria])
  const fichasMolho = fichas.filter((f) => f.categoria === "molho")

  async function criarFicha() {
    if (!novaFicha.nome.trim() || Number(novaFicha.rendimento) <= 0) return toast.error("Informe nome e rendimento padrão.")
    setSaving(true)
    const { error } = await supabase.from("producao_fichas_tecnicas").insert({
      nome: novaFicha.nome.trim(), categoria, unidade_rendimento: novaFicha.unidade,
      rendimento_padrao: Number(novaFicha.rendimento), observacoes: novaFicha.observacoes.trim() || null,
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Ficha técnica criada.")
    setNovaFicha({ nome: "", unidade: categoria === "molho" ? "ml" : "un", rendimento: "", observacoes: "" })
    await carregar()
  }

  async function adicionarItem() {
    if (!novoItem.ficha_id || !novoItem.referencia_id || Number(novoItem.quantidade) <= 0) return toast.error("Preencha a ficha, o item e a quantidade.")
    const payload = {
      ficha_id: novoItem.ficha_id,
      insumo_id: novoItem.tipo === "insumo" ? novoItem.referencia_id : null,
      componente_ficha_id: novoItem.tipo === "componente" ? novoItem.referencia_id : null,
      quantidade: Number(novoItem.quantidade), unidade: novoItem.unidade,
    }
    setSaving(true)
    const { error } = await supabase.from("producao_ficha_itens").insert(payload)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Item adicionado à ficha técnica.")
    setNovoItem((atual) => ({ ...atual, referencia_id: "", quantidade: "" }))
    await carregar()
  }

  async function registrarMolho() {
    if (!producaoMolho.ficha_id || Number(producaoMolho.receitas) <= 0) return toast.error("Selecione o molho e informe quantas receitas foram feitas.")
    setSaving(true)
    const { error } = await supabase.rpc("registrar_producao_molho", {
      ficha_id_param: producaoMolho.ficha_id,
      receitas_param: Number(producaoMolho.receitas),
      data_param: producaoMolho.data,
      grandes_param: Number(producaoMolho.grandes || 0),
      pequenas_param: Number(producaoMolho.pequenas || 0),
      observacoes_param: producaoMolho.observacoes || null,
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Produção registrada, insumos baixados e bisnagas adicionadas ao estoque.")
    setProducaoMolho({ ficha_id: "", data: hoje, receitas: "1", grandes: "", pequenas: "", observacoes: "" })
    await carregar()
  }

  if (loading) return <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando receitas...</div>

  return <div className="space-y-6">
    <PageHeader title="Receitas" description="Fichas técnicas separadas da rotina de planejamento, com composição, rendimento e produção real." />
    <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/producao?tab=estoque">Voltar ao estoque de insumos</Link></Button><Badge variant="secondary">{fichas.length} ficha(s)</Badge></div>

    <Tabs value={categoria} onValueChange={(v) => setCategoria(v as Categoria)}>
      <TabsList className="h-auto flex-wrap">{categorias.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList>
      {categorias.map((item) => <TabsContent key={item.id} value={item.id} className="mt-5 space-y-5">
        <Card><CardHeader><CardTitle>Nova ficha de {item.label.toLowerCase()}</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-[1.4fr_150px_150px_1fr_auto]">
          <Input placeholder="Nome da receita" value={novaFicha.nome} onChange={(e) => setNovaFicha({ ...novaFicha, nome: e.target.value })} />
          <select className={selectClass} value={novaFicha.unidade} onChange={(e) => setNovaFicha({ ...novaFicha, unidade: e.target.value })}><option value="un">unidades</option><option value="g">gramas</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">litros</option></select>
          <Input type="number" min="0.0001" step="0.001" placeholder="Rendimento" value={novaFicha.rendimento} onChange={(e) => setNovaFicha({ ...novaFicha, rendimento: e.target.value })} />
          <Input placeholder="Observações" value={novaFicha.observacoes} onChange={(e) => setNovaFicha({ ...novaFicha, observacoes: e.target.value })} />
          <Button disabled={saving} onClick={criarFicha}><Plus className="size-4" />Criar</Button>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Adicionar item à ficha técnica</CardTitle><p className="text-sm text-muted-foreground">Use insumos para qualquer ficha. Salgados também podem usar massas ou recheios já cadastrados, evitando dupla contagem.</p></CardHeader><CardContent className="grid gap-3 md:grid-cols-[1.3fr_140px_1.3fr_130px_120px_auto]">
          <select className={selectClass} value={novoItem.ficha_id} onChange={(e) => setNovoItem({ ...novoItem, ficha_id: e.target.value })}><option value="">Selecione a ficha</option>{fichasCategoria.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
          <select className={selectClass} value={novoItem.tipo} onChange={(e) => setNovoItem({ ...novoItem, tipo: e.target.value, referencia_id: "" })}><option value="insumo">Insumo</option>{categoria === "salgado" && <option value="componente">Massa/recheio</option>}</select>
          <select className={selectClass} value={novoItem.referencia_id} onChange={(e) => setNovoItem({ ...novoItem, referencia_id: e.target.value })}><option value="">Selecione</option>{novoItem.tipo === "insumo" ? insumos.map((i) => <option key={i.id} value={i.id}>{i.nome} · saldo {i.estoque_atual} {i.unidade}</option>) : fichas.filter((f) => ["massa","recheio"].includes(f.categoria)).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
          <Input type="number" min="0.0001" step="0.001" placeholder="Quantidade" value={novoItem.quantidade} onChange={(e) => setNovoItem({ ...novoItem, quantidade: e.target.value })} />
          <select className={selectClass} value={novoItem.unidade} onChange={(e) => setNovoItem({ ...novoItem, unidade: e.target.value })}><option>g</option><option>kg</option><option>ml</option><option>l</option><option>un</option></select>
          <Button disabled={saving} onClick={adicionarItem}><Save className="size-4" />Adicionar</Button>
        </CardContent></Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{fichasCategoria.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ficha cadastrada.</p> : fichasCategoria.map((ficha) => {
          const fichaItens = itens.filter((i) => i.ficha_id === ficha.id)
          return <Card key={ficha.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{ficha.nome}</CardTitle><p className="text-sm text-muted-foreground">Rendimento padrão: {ficha.rendimento_padrao} {ficha.unidade_rendimento}</p></div>{ficha.categoria === "molho" ? <Soup className="size-5 text-primary" /> : ficha.categoria === "massa" ? <Wheat className="size-5 text-primary" /> : <Beaker className="size-5 text-primary" />}</div></CardHeader><CardContent className="space-y-2">{fichaItens.length === 0 ? <p className="text-sm text-muted-foreground">Sem itens.</p> : fichaItens.map((linha) => { const nome = linha.insumo_id ? insumos.find((i) => i.id === linha.insumo_id)?.nome : fichas.find((f) => f.id === linha.componente_ficha_id)?.nome; return <div key={linha.id} className="flex justify-between rounded-lg bg-muted/30 p-2 text-sm"><span>{nome || "Item"}</span><strong>{linha.quantidade} {linha.unidade}</strong></div> })}</CardContent></Card>
        })}</div>
      </TabsContent>)}
    </Tabs>

    <Card className="border-primary/25"><CardHeader><CardTitle>Registrar produção de molho</CardTitle><p className="text-sm text-muted-foreground">Use no fim do dia: baixa os insumos da ficha e transforma o rendimento em estoque de bisnagas.</p></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      <div className="xl:col-span-2"><Label>Molho</Label><select className={selectClass + " mt-1"} value={producaoMolho.ficha_id} onChange={(e) => setProducaoMolho({ ...producaoMolho, ficha_id: e.target.value })}><option value="">Selecione</option>{fichasMolho.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
      <div><Label>Data</Label><Input type="date" value={producaoMolho.data} onChange={(e) => setProducaoMolho({ ...producaoMolho, data: e.target.value })} /></div>
      <div><Label>Receitas feitas</Label><Input type="number" min="0.1" step="0.1" value={producaoMolho.receitas} onChange={(e) => setProducaoMolho({ ...producaoMolho, receitas: e.target.value })} /></div>
      <div><Label>Bisnagas grandes</Label><Input type="number" min="0" step="1" value={producaoMolho.grandes} onChange={(e) => setProducaoMolho({ ...producaoMolho, grandes: e.target.value })} /></div>
      <div><Label>Bisnagas pequenas</Label><Input type="number" min="0" step="1" value={producaoMolho.pequenas} onChange={(e) => setProducaoMolho({ ...producaoMolho, pequenas: e.target.value })} /></div>
      <Input className="md:col-span-2 xl:col-span-5" placeholder="Observações da produção" value={producaoMolho.observacoes} onChange={(e) => setProducaoMolho({ ...producaoMolho, observacoes: e.target.value })} />
      <Button disabled={saving} onClick={registrarMolho}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Registrar produção</Button>
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Estoque e histórico de molhos</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{lotes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma produção de molho registrada.</p> : lotes.map((lote) => { const ficha = fichas.find((f) => f.id === lote.ficha_id); return <div key={lote.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{ficha?.nome || "Molho"}</p><p className="font-mono text-xs text-primary">{lote.codigo}</p></div><Badge variant="outline">{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${lote.data_producao}T12:00:00Z`))}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-muted/30 p-2">Grandes: <strong>{lote.bisnagas_grandes_disponiveis}</strong></div><div className="rounded-lg bg-muted/30 p-2">Pequenas: <strong>{lote.bisnagas_pequenas_disponiveis}</strong></div></div><p className="mt-2 text-xs text-muted-foreground">{lote.receitas_produzidas} receita(s) · rendimento esperado {lote.rendimento_esperado}</p></div> })}</CardContent></Card>
  </div>
}
