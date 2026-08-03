"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Archive, Edit3, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react"
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
  id: string
  nome: string
  categoria: Categoria
  unidade_rendimento: string
  rendimento_padrao: number
  capacidade_unidades_aprox: number | null
  modo_preparo: string | null
  observacoes: string | null
  rendimento_confirmado: boolean
  revisao_pendente: boolean
  versao: number
  ativo: boolean
}
type Insumo = {
  id: string
  nome: string
  unidade: string
  estoque_atual: number
  controla_estoque: boolean
  custo_unitario: number
  ativo: boolean
}
type Item = {
  id: string
  ficha_id: string
  insumo_id: string | null
  componente_ficha_id: string | null
  quantidade: number
  unidade: string
}
type Custo = { ficha_id: string; custo_receita: number; custo_por_unidade_rendimento: number }
type MedidaPendente = {
  id: string
  ficha_id: string
  item_id: string | null
  descricao: string
  medida_original: string
  quantidade_original: number | null
  resolvida: boolean
  quantidade_padronizada: number | null
  unidade_padronizada: string | null
  observacoes_resolucao: string | null
}
type ResolucaoMedida = { quantidade: string; unidade: string; observacoes: string }

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
const textareaClass = "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
const unidades = ["un", "g", "kg", "ml", "l"]
const categorias: { id: Categoria; label: string }[] = [
  { id: "salgado", label: "Salgados" },
  { id: "massa", label: "Massas" },
  { id: "recheio", label: "Recheios" },
  { id: "molho", label: "Molhos" },
]
const vazio = {
  nome: "",
  unidade: "un",
  rendimento: "",
  capacidade: "",
  modo: "",
  observacoes: "",
  confirmado: false,
  pendente: false,
}

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
  const [medidas, setMedidas] = useState<MedidaPendente[]>([])
  const [form, setForm] = useState(vazio)
  const [edicaoId, setEdicaoId] = useState<string | null>(null)
  const [resolucoes, setResolucoes] = useState<Record<string, ResolucaoMedida>>({})
  const [novoItem, setNovoItem] = useState({ ficha_id: "", tipo: "insumo", referencia_id: "", quantidade: "", unidade: "g" })

  async function carregar() {
    setLoading(true)
    const [fichasResult, insumosResult, itensResult, custosResult, medidasResult] = await Promise.all([
      supabase.from("producao_fichas_tecnicas").select("*").order("categoria").order("nome"),
      supabase.from("producao_insumos").select("id,nome,unidade,estoque_atual,controla_estoque,custo_unitario,ativo").eq("ativo", true).order("nome"),
      supabase.from("producao_ficha_itens").select("*").order("created_at"),
      supabase.from("producao_custos_fichas").select("ficha_id,custo_receita,custo_por_unidade_rendimento"),
      supabase.from("producao_ficha_medidas_pendentes").select("*").order("created_at"),
    ])
    const erro = fichasResult.error || insumosResult.error || itensResult.error || custosResult.error || medidasResult.error
    if (erro) toast.error("Não foi possível carregar as fichas técnicas.")
    setFichas((fichasResult.data ?? []) as Ficha[])
    setInsumos((insumosResult.data ?? []) as Insumo[])
    setItens((itensResult.data ?? []) as Item[])
    setCustos((custosResult.data ?? []) as Custo[])
    setMedidas((medidasResult.data ?? []) as MedidaPendente[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [])

  const fichasCategoria = useMemo(
    () => fichas.filter((f) => f.categoria === categoria && (mostrarInativas || f.ativo)),
    [fichas, categoria, mostrarInativas],
  )
  const componentesPossiveis = fichas.filter((f) => f.ativo && f.id !== novoItem.ficha_id)
  const pendenciasEdicao = medidas.filter((medida) => medida.ficha_id === edicaoId && !medida.resolvida)

  function pendenciasDaFicha(fichaId: string) {
    return medidas.filter((medida) => medida.ficha_id === fichaId && !medida.resolvida)
  }

  function limpar(categoriaAtual: Categoria = categoria) {
    setEdicaoId(null)
    setResolucoes({})
    setForm({ ...vazio, unidade: categoriaAtual === "salgado" ? "un" : "kg" })
  }

  function iniciarEdicao(ficha: Ficha) {
    const pendencias = pendenciasDaFicha(ficha.id)
    setEdicaoId(ficha.id)
    setCategoria(ficha.categoria)
    setForm({
      nome: ficha.nome,
      unidade: ficha.unidade_rendimento,
      rendimento: String(ficha.rendimento_padrao),
      capacidade: ficha.capacidade_unidades_aprox ? String(ficha.capacidade_unidades_aprox) : "",
      modo: ficha.modo_preparo ?? "",
      observacoes: ficha.observacoes ?? "",
      confirmado: ficha.rendimento_confirmado,
      pendente: ficha.revisao_pendente,
    })
    setResolucoes(Object.fromEntries(pendencias.map((medida) => [medida.id, { quantidade: "", unidade: "", observacoes: "" }])))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function abrirRegularizacao(fichaId: string) {
    const ficha = fichas.find((item) => item.id === fichaId)
    if (!ficha || pendenciasDaFicha(fichaId).length === 0) return false
    toast.error("Esta ficha possui medidas obrigatórias. Padronize-as antes de alterar a receita.")
    iniciarEdicao(ficha)
    return true
  }

  function atualizarResolucao(id: string, campo: keyof ResolucaoMedida, valor: string) {
    setResolucoes((atual) => ({
      ...atual,
      [id]: { ...(atual[id] ?? { quantidade: "", unidade: "", observacoes: "" }), [campo]: valor },
    }))
  }

  async function salvarFicha() {
    if (!form.nome.trim() || Number(form.rendimento) <= 0) return toast.error("Informe nome e rendimento.")

    for (const pendencia of pendenciasEdicao) {
      const resolucao = resolucoes[pendencia.id]
      if (!resolucao || Number(resolucao.quantidade) <= 0 || !unidades.includes(resolucao.unidade)) {
        return toast.error(`Preencha a quantidade e a unidade de: ${pendencia.descricao}`)
      }
      if (!pendencia.item_id && !resolucao.observacoes.trim()) {
        return toast.error(`Explique como a lacuna foi padronizada em: ${pendencia.descricao}`)
      }
    }

    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      categoria,
      unidade_rendimento: form.unidade,
      rendimento_padrao: Number(form.rendimento),
      capacidade_unidades_aprox: form.capacidade ? Number(form.capacidade) : null,
      modo_preparo: form.modo.trim() || null,
      observacoes: form.observacoes.trim() || null,
      rendimento_confirmado: form.confirmado,
      revisao_pendente: form.pendente,
    }

    const { error } = edicaoId
      ? await supabase.rpc("atualizar_ficha_tecnica_com_medidas", {
          ficha_id_param: edicaoId,
          nome_param: payload.nome,
          categoria_param: categoria,
          rendimento_param: payload.rendimento_padrao,
          unidade_param: payload.unidade_rendimento,
          capacidade_param: payload.capacidade_unidades_aprox,
          modo_preparo_param: payload.modo_preparo,
          observacoes_param: payload.observacoes,
          rendimento_confirmado_param: payload.rendimento_confirmado,
          revisao_pendente_param: payload.revisao_pendente,
          medidas_param: pendenciasEdicao.map((pendencia) => ({
            id: pendencia.id,
            quantidade: Number(resolucoes[pendencia.id].quantidade),
            unidade: resolucoes[pendencia.id].unidade,
            observacoes: resolucoes[pendencia.id].observacoes.trim() || null,
          })),
        })
      : await supabase.from("producao_fichas_tecnicas").insert(payload)

    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(edicaoId ? "Ficha atualizada e medidas padronizadas." : "Ficha criada.")
    limpar()
    await carregar()
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
    if (abrirRegularizacao(novoItem.ficha_id)) return
    setSaving(true)
    const { error } = await supabase.from("producao_ficha_itens").insert({
      ficha_id: novoItem.ficha_id,
      insumo_id: novoItem.tipo === "insumo" ? novoItem.referencia_id : null,
      componente_ficha_id: novoItem.tipo === "componente" ? novoItem.referencia_id : null,
      quantidade: Number(novoItem.quantidade),
      unidade: novoItem.unidade,
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Item incluído.")
    setNovoItem((atual) => ({ ...atual, referencia_id: "", quantidade: "" }))
    await carregar()
  }

  async function editarItem(item: Item) {
    if (abrirRegularizacao(item.ficha_id)) return
    const quantidade = window.prompt("Nova quantidade:", String(item.quantidade))
    if (!quantidade || Number(quantidade) <= 0) return
    const unidade = window.prompt("Unidade: un, g, kg, ml ou l", item.unidade)
    if (!unidade || !unidades.includes(unidade)) return toast.error("Unidade inválida.")
    const { error } = await supabase.from("producao_ficha_itens").update({ quantidade: Number(quantidade), unidade }).eq("id", item.id)
    if (error) return toast.error(error.message)
    toast.success("Item atualizado.")
    await carregar()
  }

  async function excluirItem(item: Item) {
    if (abrirRegularizacao(item.ficha_id)) return
    if (!window.confirm("Remover este item da receita?")) return
    const { error } = await supabase.from("producao_ficha_itens").delete().eq("id", item.id)
    if (error) return toast.error(error.message)
    toast.success("Item removido.")
    await carregar()
  }

  if (loading) return <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando fichas técnicas...</div>

  return <div className="space-y-6">
    <PageHeader title="Ficha Técnica" description="Composição e rendimento das receitas. A produção e o estoque de molhos ficam na seção Molhos." />
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">{fichas.filter((f) => f.ativo).length} ativas</Badge>
      <Badge variant="outline">{fichas.filter((f) => f.revisao_pendente && f.ativo).length} aguardando revisão</Badge>
      <Badge variant="destructive">{medidas.filter((medida) => !medida.resolvida).length} medidas obrigatórias</Badge>
      <Button variant="outline" onClick={() => setMostrarInativas((valor) => !valor)}>{mostrarInativas ? "Ocultar inativas" : "Mostrar inativas"}</Button>
    </div>

    <Tabs value={categoria} onValueChange={(valor) => { const novaCategoria = valor as Categoria; setCategoria(novaCategoria); limpar(novaCategoria) }}>
      <TabsList className="h-auto flex-wrap">{categorias.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList>
      {categorias.map((itemCategoria) => <TabsContent key={itemCategoria.id} value={itemCategoria.id} className="mt-5 space-y-5">
        <Card className="border-primary/25">
          <CardHeader><CardTitle>{edicaoId ? "Editar ficha" : `Nova ficha de ${itemCategoria.label.toLowerCase()}`}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {pendenciasEdicao.length > 0 && <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
                <div><p className="font-semibold">Padronização obrigatória</p><p className="text-sm text-muted-foreground">Esta ficha veio de anotações com colheres, gomos, copos ou medidas sem conversão. Para salvar qualquer alteração, preencha todas as lacunas abaixo.</p></div>
              </div>
              <div className="mt-4 grid gap-3">{pendenciasEdicao.map((pendencia) => {
                const resolucao = resolucoes[pendencia.id] ?? { quantidade: "", unidade: "", observacoes: "" }
                return <div key={pendencia.id} className="rounded-lg border bg-background p-3">
                  <p className="font-medium">{pendencia.descricao}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Medida anterior: {pendencia.quantidade_original ? `${pendencia.quantidade_original} ` : ""}{pendencia.medida_original}</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-[150px_120px_1fr]">
                    <Input required type="number" min="0.0001" step="0.001" placeholder="Quantidade real" value={resolucao.quantidade} onChange={(event) => atualizarResolucao(pendencia.id, "quantidade", event.target.value)} />
                    <select required className={selectClass} value={resolucao.unidade} onChange={(event) => atualizarResolucao(pendencia.id, "unidade", event.target.value)}><option value="">Unidade</option>{unidades.map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}</select>
                    <Input required={!pendencia.item_id} placeholder={pendencia.item_id ? "Observação da conversão (opcional)" : "Explique o ingrediente ou a referência usada"} value={resolucao.observacoes} onChange={(event) => atualizarResolucao(pendencia.id, "observacoes", event.target.value)} />
                  </div>
                </div>
              })}</div>
            </div>}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Input placeholder="Nome" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
              <Input type="number" min="0.0001" step="0.001" placeholder="Rendimento por receita" value={form.rendimento} onChange={(event) => setForm({ ...form, rendimento: event.target.value })} />
              <select className={selectClass} value={form.unidade} onChange={(event) => setForm({ ...form, unidade: event.target.value })}>{unidades.map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}</select>
              <Input type="number" min="0" placeholder="Capacidade aprox. em unidades" value={form.capacidade} onChange={(event) => setForm({ ...form, capacidade: event.target.value })} />
              <div className="flex gap-2"><Button className="flex-1" disabled={saving} onClick={salvarFicha}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Salvar</Button>{edicaoId && <Button variant="outline" onClick={() => limpar()}>Cancelar</Button>}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Modo de preparo</Label><textarea className={textareaClass} value={form.modo} onChange={(event) => setForm({ ...form, modo: event.target.value })} /></div>
              <div><Label>Observações e pendências</Label><textarea className={textareaClass} value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} /></div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.confirmado} onChange={(event) => setForm({ ...form, confirmado: event.target.checked })} />Rendimento confirmado por medição</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.pendente} onChange={(event) => setForm({ ...form, pendente: event.target.checked })} />Ainda possui outra informação pendente de revisão</label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Adicionar ingrediente ou preparação</CardTitle><p className="text-sm text-muted-foreground">Componentes podem ser usados em qualquer nível. Ciclos são bloqueados automaticamente.</p></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.3fr_140px_1.3fr_120px_100px_auto]">
            <select className={selectClass} value={novoItem.ficha_id} onChange={(event) => setNovoItem({ ...novoItem, ficha_id: event.target.value, referencia_id: "" })}><option value="">Ficha</option>{fichasCategoria.filter((ficha) => ficha.ativo).map((ficha) => <option key={ficha.id} value={ficha.id}>{ficha.nome}</option>)}</select>
            <select className={selectClass} value={novoItem.tipo} onChange={(event) => setNovoItem({ ...novoItem, tipo: event.target.value, referencia_id: "" })}><option value="insumo">Insumo</option><option value="componente">Outra ficha</option></select>
            <select className={selectClass} value={novoItem.referencia_id} onChange={(event) => setNovoItem({ ...novoItem, referencia_id: event.target.value })}><option value="">Selecione</option>{novoItem.tipo === "insumo" ? insumos.map((insumo) => <option key={insumo.id} value={insumo.id}>{insumo.nome}{!insumo.controla_estoque ? " · não controlado" : ""}</option>) : componentesPossiveis.map((ficha) => <option key={ficha.id} value={ficha.id}>{ficha.categoria} · {ficha.nome}</option>)}</select>
            <Input type="number" min="0.0001" step="0.001" placeholder="Quantidade" value={novoItem.quantidade} onChange={(event) => setNovoItem({ ...novoItem, quantidade: event.target.value })} />
            <select className={selectClass} value={novoItem.unidade} onChange={(event) => setNovoItem({ ...novoItem, unidade: event.target.value })}>{unidades.map((unidade) => <option key={unidade}>{unidade}</option>)}</select>
            <Button disabled={saving} onClick={adicionarItem}><Plus className="size-4" />Adicionar</Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">{fichasCategoria.map((ficha) => {
          const linhas = itens.filter((linha) => linha.ficha_id === ficha.id)
          const custo = custos.find((itemCusto) => itemCusto.ficha_id === ficha.id)
          const pendencias = pendenciasDaFicha(ficha.id)
          return <Card key={ficha.id} className={!ficha.ativo ? "opacity-60" : undefined}>
            <CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{ficha.nome}</CardTitle><p className="text-sm text-muted-foreground">{ficha.rendimento_padrao} {ficha.unidade_rendimento} por receita{ficha.capacidade_unidades_aprox ? ` · aprox. ${ficha.capacidade_unidades_aprox} unidades` : ""}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant={ficha.rendimento_confirmado ? "default" : "outline"}>{ficha.rendimento_confirmado ? "medido" : "estimado"}</Badge>{ficha.revisao_pendente && <Badge variant="destructive">revisar</Badge>}{pendencias.length > 0 && <Badge variant="destructive">{pendencias.length} medida(s) obrigatória(s)</Badge>}<Badge variant="secondary">v{ficha.versao}</Badge></div></div><div className="flex gap-1"><Button size="icon" variant="outline" onClick={() => iniciarEdicao(ficha)} title="Editar"><Edit3 className="size-4" /></Button><Button size="icon" variant="outline" onClick={() => alterarAtivo(ficha)} title={ficha.ativo ? "Excluir/inativar" : "Reativar"}>{ficha.ativo ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}</Button></div></div></CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-muted/30 p-3 text-sm"><strong>Custo estimado da receita:</strong> R$ {Number(custo?.custo_receita ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}<br/><span className="text-muted-foreground">Por {ficha.unidade_rendimento}: R$ {Number(custo?.custo_por_unidade_rendimento ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 4 })}</span></div>
              {pendencias.length > 0 && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><strong>Antes de alterar esta receita:</strong><ul className="mt-1 list-inside list-disc text-muted-foreground">{pendencias.map((pendencia) => <li key={pendencia.id}>{pendencia.descricao}</li>)}</ul></div>}
              {linhas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p> : linhas.map((linha) => {
                const nome = linha.insumo_id ? insumos.find((insumo) => insumo.id === linha.insumo_id)?.nome : fichas.find((itemFicha) => itemFicha.id === linha.componente_ficha_id)?.nome
                return <div key={linha.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"><span>{nome ?? "Item"}</span><div className="flex items-center gap-2"><strong>{linha.quantidade} {linha.unidade}</strong><Button size="icon" variant="ghost" onClick={() => editarItem(linha)}><Edit3 className="size-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => excluirItem(linha)}><Trash2 className="size-3.5" /></Button></div></div>
              })}
              {ficha.modo_preparo && <details className="text-sm"><summary className="cursor-pointer font-semibold">Modo de preparo</summary><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{ficha.modo_preparo}</p></details>}
              {ficha.observacoes && <p className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">{ficha.observacoes}</p>}
            </CardContent>
          </Card>
        })}</div>
      </TabsContent>)}
    </Tabs>
  </div>
}
