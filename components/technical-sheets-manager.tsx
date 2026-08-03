"use client"

import { useEffect, useMemo, useState } from "react"
import { Archive, Check, Edit3, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react"
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
type Ficha = {
  id: string; nome: string; categoria: Categoria; unidade_rendimento: string; rendimento_padrao: number
  capacidade_unidades_aprox: number | null; modo_preparo: string | null; observacoes: string | null
  rendimento_confirmado: boolean; revisao_pendente: boolean; versao: number; ativo: boolean
}
type Insumo = { id: string; nome: string; unidade: string; estoque_atual: number; controla_estoque: boolean; custo_unitario: number; ativo: boolean }
type Item = { id: string; ficha_id: string; insumo_id: string | null; componente_ficha_id: string | null; quantidade: number; unidade: string }
type Custo = { ficha_id: string; custo_receita: number; custo_por_unidade_rendimento: number }

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
const textareaClass = "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
const categorias: { id: Categoria; label: string }[] = [
  { id: "salgado", label: "Salgados" }, { id: "massa", label: "Massas" },
  { id: "recheio", label: "Recheios" }, { id: "molho", label: "Molhos" },
]
const vazio = { nome: "", unidade: "un", rendimento: "", capacidade: "", modo: "", observacoes: "", confirmado: false, pendente: false }

export function TechnicalSheetsManager() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categoria, setCategoria] = useState<Categoria>("salgado")
  const [mostrarInativas, setMostrarInativas] = useState(false)
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [custos, setCustos] = useState<Custo[]>([])
  const [form, setForm] = useState(vazio)
  const [edicaoId, setEdicaoId] = useState<string | null>(null)
  const [novoItem, setNovoItem] = useState({ ficha_id: "", tipo: "insumo", referencia_id: "", quantidade: "", unidade: "g" })

  async function carregar() {
    setLoading(true)
    const [fichasResult, insumosResult, itensResult, custosResult] = await Promise.all([
      supabase.from("producao_fichas_tecnicas").select("*").order("categoria").order("nome"),
      supabase.from("producao_insumos").select("id,nome,unidade,estoque_atual,controla_estoque,custo_unitario,ativo").eq("ativo", true).order("nome"),
      supabase.from("producao_ficha_itens").select("*").order("created_at"),
      supabase.from("producao_custos_fichas").select("ficha_id,custo_receita,custo_por_unidade_rendimento"),
    ])
    const erro = fichasResult.error || insumosResult.error || itensResult.error || custosResult.error
    if (erro) toast.error("Não foi possível carregar as fichas técnicas.")
    setFichas((fichasResult.data ?? []) as Ficha[])
    setInsumos((insumosResult.data ?? []) as Insumo[])
    setItens((itensResult.data ?? []) as Item[])
    setCustos((custosResult.data ?? []) as Custo[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [])

  const fichasCategoria = useMemo(() => fichas.filter((f) => f.categoria === categoria && (mostrarInativas || f.ativo)), [fichas, categoria, mostrarInativas])
  const componentesPossiveis = fichas.filter((f) => f.ativo && f.id !== novoItem.ficha_id)

  function iniciarEdicao(ficha: Ficha) {
    setEdicaoId(ficha.id)
    setCategoria(ficha.categoria)
    setForm({ nome: ficha.nome, unidade: ficha.unidade_rendimento, rendimento: String(ficha.rendimento_padrao), capacidade: ficha.capacidade_unidades_aprox ? String(ficha.capacidade_unidades_aprox) : "", modo: ficha.modo_preparo ?? "", observacoes: ficha.observacoes ?? "", confirmado: ficha.rendimento_confirmado, pendente: ficha.revisao_pendente })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function limpar() { setEdicaoId(null); setForm({ ...vazio, unidade: categoria === "salgado" ? "un" : "kg" }) }

  async function salvarFicha() {
    if (!form.nome.trim() || Number(form.rendimento) <= 0) return toast.error("Informe nome e rendimento.")
    setSaving(true)
    const payload = { nome: form.nome.trim(), categoria, unidade_rendimento: form.unidade, rendimento_padrao: Number(form.rendimento), capacidade_unidades_aprox: form.capacidade ? Number(form.capacidade) : null, modo_preparo: form.modo.trim() || null, observacoes: form.observacoes.trim() || null, rendimento_confirmado: form.confirmado, revisao_pendente: form.pendente }
    const { error } = edicaoId
      ? await supabase.rpc("atualizar_ficha_tecnica", { ficha_id_param: edicaoId, nome_param: payload.nome, categoria_param: categoria, rendimento_param: payload.rendimento_padrao, unidade_param: payload.unidade_rendimento, capacidade_param: payload.capacidade_unidades_aprox, modo_preparo_param: payload.modo_preparo, observacoes_param: payload.observacoes, rendimento_confirmado_param: payload.rendimento_confirmado, revisao_pendente_param: payload.revisao_pendente })
      : await supabase.from("producao_fichas_tecnicas").insert(payload)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(edicaoId ? "Ficha atualizada e versão anterior preservada." : "Ficha criada.")
    limpar(); await carregar()
  }

  async function alterarAtivo(ficha: Ficha) {
    const motivo = ficha.ativo ? window.prompt("Motivo da exclusão/inativação da receita:", "Receita substituída ou não utilizada") : null
    if (ficha.ativo && motivo === null) return
    setSaving(true)
    const { error } = ficha.ativo
      ? await supabase.rpc("inativar_ficha_tecnica", { ficha_id_param: ficha.id, motivo_param: motivo })
      : await supabase.rpc("reativar_ficha_tecnica", { ficha_id_param: ficha.id })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(ficha.ativo ? "Ficha inativada sem apagar o histórico." : "Ficha reativada.")
    await carregar()
  }

  async function adicionarItem() {
    if (!novoItem.ficha_id || !novoItem.referencia_id || Number(novoItem.quantidade) <= 0) return toast.error("Preencha ficha, item e quantidade.")
    setSaving(true)
    const { error } = await supabase.from("producao_ficha_itens").insert({ ficha_id: novoItem.ficha_id, insumo_id: novoItem.tipo === "insumo" ? novoItem.referencia_id : null, componente_ficha_id: novoItem.tipo === "componente" ? novoItem.referencia_id : null, quantidade: Number(novoItem.quantidade), unidade: novoItem.unidade })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Item incluído.")
    setNovoItem((a) => ({ ...a, referencia_id: "", quantidade: "" })); await carregar()
  }

  async function editarItem(item: Item) {
    const quantidade = window.prompt("Nova quantidade:", String(item.quantidade)); if (!quantidade) return
    const unidade = window.prompt("Unidade: un, g, kg, ml ou l", item.unidade); if (!unidade) return
    const { error } = await supabase.from("producao_ficha_itens").update({ quantidade: Number(quantidade), unidade }).eq("id", item.id)
    if (error) return toast.error(error.message)
    toast.success("Item atualizado."); await carregar()
  }

  async function excluirItem(item: Item) {
    if (!window.confirm("Remover este item da receita?")) return
    const { error } = await supabase.from("producao_ficha_itens").delete().eq("id", item.id)
    if (error) return toast.error(error.message)
    toast.success("Item removido."); await carregar()
  }

  if (loading) return <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando fichas técnicas...</div>

  return <div className="space-y-6">
    <PageHeader title="Ficha Técnica" description="Livro de receitas versionado, editável e conectado aos estoques e ao planejamento." />
    <div className="flex flex-wrap gap-2"><Badge variant="secondary">{fichas.filter((f) => f.ativo).length} ativas</Badge><Badge variant="outline">{fichas.filter((f) => f.revisao_pendente && f.ativo).length} aguardando medição</Badge><Button variant="outline" onClick={() => setMostrarInativas((v) => !v)}>{mostrarInativas ? "Ocultar inativas" : "Mostrar inativas"}</Button></div>

    <Tabs value={categoria} onValueChange={(v) => { setCategoria(v as Categoria); limpar() }}>
      <TabsList className="h-auto flex-wrap">{categorias.map((c) => <TabsTrigger key={c.id} value={c.id}>{c.label}</TabsTrigger>)}</TabsList>
      {categorias.map((c) => <TabsContent key={c.id} value={c.id} className="mt-5 space-y-5">
        <Card className="border-primary/25"><CardHeader><CardTitle>{edicaoId ? "Editar ficha" : `Nova ficha de ${c.label.toLowerCase()}`}</CardTitle></CardHeader><CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Input placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /><Input type="number" step="0.001" placeholder="Rendimento por receita" value={form.rendimento} onChange={(e) => setForm({ ...form, rendimento: e.target.value })} /><select className={selectClass} value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })}><option value="un">un</option><option value="kg">kg</option><option value="g">g</option><option value="l">l</option><option value="ml">ml</option></select><Input type="number" placeholder="Capacidade aprox. em unidades" value={form.capacidade} onChange={(e) => setForm({ ...form, capacidade: e.target.value })} /><div className="flex gap-2"><Button className="flex-1" disabled={saving} onClick={salvarFicha}><Save className="size-4" />Salvar</Button>{edicaoId && <Button variant="outline" onClick={limpar}>Cancelar</Button>}</div></div>
          <div className="grid gap-3 md:grid-cols-2"><div><Label>Modo de preparo</Label><textarea className={textareaClass} value={form.modo} onChange={(e) => setForm({ ...form, modo: e.target.value })} /></div><div><Label>Observações e pendências</Label><textarea className={textareaClass} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></div></div>
          <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.confirmado} onChange={(e) => setForm({ ...form, confirmado: e.target.checked })} />Rendimento confirmado por medição</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.pendente} onChange={(e) => setForm({ ...form, pendente: e.target.checked })} />Possui informação pendente de revisão</label></div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Adicionar ingrediente ou preparação</CardTitle><p className="text-sm text-muted-foreground">Componentes podem ser usados em qualquer nível. Ciclos são bloqueados automaticamente.</p></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_140px_1.3fr_120px_100px_auto]">
          <select className={selectClass} value={novoItem.ficha_id} onChange={(e) => setNovoItem({ ...novoItem, ficha_id: e.target.value, referencia_id: "" })}><option value="">Ficha</option>{fichasCategoria.filter((f) => f.ativo).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
          <select className={selectClass} value={novoItem.tipo} onChange={(e) => setNovoItem({ ...novoItem, tipo: e.target.value, referencia_id: "" })}><option value="insumo">Insumo</option><option value="componente">Outra ficha</option></select>
          <select className={selectClass} value={novoItem.referencia_id} onChange={(e) => setNovoItem({ ...novoItem, referencia_id: e.target.value })}><option value="">Selecione</option>{novoItem.tipo === "insumo" ? insumos.map((i) => <option key={i.id} value={i.id}>{i.nome}{!i.controla_estoque ? " · não controlado" : ""}</option>) : componentesPossiveis.map((f) => <option key={f.id} value={f.id}>{f.categoria} · {f.nome}</option>)}</select>
          <Input type="number" step="0.001" placeholder="Quantidade" value={novoItem.quantidade} onChange={(e) => setNovoItem({ ...novoItem, quantidade: e.target.value })} /><select className={selectClass} value={novoItem.unidade} onChange={(e) => setNovoItem({ ...novoItem, unidade: e.target.value })}><option>g</option><option>kg</option><option>ml</option><option>l</option><option>un</option></select><Button disabled={saving} onClick={adicionarItem}><Plus className="size-4" />Adicionar</Button>
        </CardContent></Card>

        <div className="grid gap-4 lg:grid-cols-2">{fichasCategoria.map((ficha) => {
          const linhas = itens.filter((i) => i.ficha_id === ficha.id); const custo = custos.find((custo) => custo.ficha_id === ficha.id)
          return <Card key={ficha.id} className={!ficha.ativo ? "opacity-60" : undefined}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{ficha.nome}</CardTitle><p className="text-sm text-muted-foreground">{ficha.rendimento_padrao} {ficha.unidade_rendimento} por receita{ficha.capacidade_unidades_aprox ? ` · aprox. ${ficha.capacidade_unidades_aprox} unidades` : ""}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant={ficha.rendimento_confirmado ? "default" : "outline"}>{ficha.rendimento_confirmado ? "medido" : "estimado"}</Badge>{ficha.revisao_pendente && <Badge variant="destructive">revisar</Badge>}<Badge variant="secondary">v{ficha.versao}</Badge></div></div><div className="flex gap-1"><Button size="icon" variant="outline" onClick={() => iniciarEdicao(ficha)} title="Editar"><Edit3 className="size-4" /></Button><Button size="icon" variant="outline" onClick={() => alterarAtivo(ficha)} title={ficha.ativo ? "Excluir/inativar" : "Reativar"}>{ficha.ativo ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}</Button></div></div></CardHeader><CardContent className="space-y-3">
            <div className="rounded-lg bg-muted/30 p-3 text-sm"><strong>Custo estimado da receita:</strong> R$ {Number(custo?.custo_receita ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}<br/><span className="text-muted-foreground">Por {ficha.unidade_rendimento}: R$ {Number(custo?.custo_por_unidade_rendimento ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 4 })}</span></div>
            {linhas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p> : linhas.map((linha) => { const nome = linha.insumo_id ? insumos.find((i) => i.id === linha.insumo_id)?.nome : fichas.find((f) => f.id === linha.componente_ficha_id)?.nome; return <div key={linha.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"><span>{nome ?? "Item"}</span><div className="flex items-center gap-2"><strong>{linha.quantidade} {linha.unidade}</strong><Button size="icon" variant="ghost" onClick={() => editarItem(linha)}><Edit3 className="size-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => excluirItem(linha)}><Trash2 className="size-3.5" /></Button></div></div> })}
            {ficha.modo_preparo && <details className="text-sm"><summary className="cursor-pointer font-semibold">Modo de preparo</summary><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{ficha.modo_preparo}</p></details>}
            {ficha.observacoes && <p className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">{ficha.observacoes}</p>}
          </CardContent></Card>
        })}</div>
      </TabsContent>)}
    </Tabs>
  </div>
}
