"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, PackagePlus, Save } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Ficha = {
  id: string
  nome: string
  categoria: "massa" | "recheio"
  unidade_rendimento: string
  rendimento_padrao: number
  capacidade_unidades_aprox: number | null
  modo_preparo: string | null
}

type Estoque = {
  ficha_id: string
  nome: string
  categoria: "massa" | "recheio"
  unidade: string
  quantidade_disponivel: number
  ultima_producao: string | null
}

type Lote = {
  id: string
  ficha_id: string
  codigo: string
  data_producao: string
  receitas_produzidas: number
  quantidade_prevista: number
  quantidade_produzida: number
  quantidade_disponivel: number
  unidade: string
}

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"

export function PreparosIntermediarios() {
  const supabase = createClient()
  const hoje = new Date().toISOString().slice(0, 10)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [estoques, setEstoques] = useState<Estoque[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [config, setConfig] = useState({ ficha_id: "", rendimento: "", unidade: "kg", capacidade: "", modo: "" })
  const [producao, setProducao] = useState({ ficha_id: "", receitas: "1", quantidade_real: "", unidade: "kg", data: hoje, observacoes: "" })

  async function carregar() {
    setLoading(true)
    const [fichasResult, estoquesResult, lotesResult] = await Promise.all([
      supabase
        .from("producao_fichas_tecnicas")
        .select("id,nome,categoria,unidade_rendimento,rendimento_padrao,capacidade_unidades_aprox,modo_preparo")
        .in("categoria", ["massa", "recheio"])
        .eq("ativo", true)
        .order("categoria")
        .order("nome"),
      supabase.from("producao_estoque_preparos").select("*").order("categoria").order("nome"),
      supabase.from("producao_preparos_lotes").select("*").order("data_producao", { ascending: false }).limit(30),
    ])
    const erro = fichasResult.error || estoquesResult.error || lotesResult.error
    if (erro) toast.error("Não foi possível carregar os preparos intermediários.")
    setFichas((fichasResult.data ?? []) as Ficha[])
    setEstoques((estoquesResult.data ?? []) as Estoque[])
    setLotes((lotesResult.data ?? []) as Lote[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [])

  const fichaConfig = useMemo(() => fichas.find((f) => f.id === config.ficha_id), [fichas, config.ficha_id])
  const fichaProducao = useMemo(() => fichas.find((f) => f.id === producao.ficha_id), [fichas, producao.ficha_id])

  function selecionarConfig(id: string) {
    const ficha = fichas.find((item) => item.id === id)
    setConfig({
      ficha_id: id,
      rendimento: ficha ? String(ficha.rendimento_padrao) : "",
      unidade: ficha?.unidade_rendimento ?? "kg",
      capacidade: ficha?.capacidade_unidades_aprox ? String(ficha.capacidade_unidades_aprox) : "",
      modo: ficha?.modo_preparo ?? "",
    })
  }

  function selecionarProducao(id: string) {
    const ficha = fichas.find((item) => item.id === id)
    setProducao((atual) => ({
      ...atual,
      ficha_id: id,
      unidade: ficha?.unidade_rendimento ?? "kg",
      quantidade_real: ficha ? String(ficha.rendimento_padrao) : "",
    }))
  }

  async function salvarRendimento() {
    if (!config.ficha_id || Number(config.rendimento) <= 0) return toast.error("Selecione a ficha e informe o rendimento por receita.")
    if (fichaConfig?.categoria === "massa" && Number(config.capacidade) <= 0) return toast.error("Informe a capacidade aproximada em salgados da massa.")
    setSaving(true)
    const { error } = await supabase
      .from("producao_fichas_tecnicas")
      .update({
        rendimento_padrao: Number(config.rendimento),
        unidade_rendimento: config.unidade,
        capacidade_unidades_aprox: config.capacidade ? Number(config.capacidade) : null,
        modo_preparo: config.modo.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.ficha_id)
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Rendimento da ficha atualizado.")
    await carregar()
  }

  async function registrarProducao() {
    if (!producao.ficha_id || Number(producao.receitas) <= 0 || Number(producao.quantidade_real) <= 0) {
      return toast.error("Selecione a ficha e informe receitas e rendimento real.")
    }
    setSaving(true)
    const { error } = await supabase.rpc("registrar_producao_preparo", {
      ficha_id_param: producao.ficha_id,
      receitas_param: Number(producao.receitas),
      quantidade_real_param: Number(producao.quantidade_real),
      unidade_param: producao.unidade,
      data_param: producao.data,
      observacoes_param: producao.observacoes.trim() || null,
    })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Produção registrada. Ingredientes baixados e preparo adicionado ao estoque.")
    setProducao({ ficha_id: "", receitas: "1", quantidade_real: "", unidade: "kg", data: hoje, observacoes: "" })
    await carregar()
  }

  if (loading) return <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando massas e recheios...</div>

  return <div className="space-y-5">
    <Card className="border-primary/25">
      <CardHeader>
        <CardTitle>Rendimento da massa e dos recheios</CardTitle>
        <p className="text-sm text-muted-foreground">Na massa padrão, cadastre 12 kg por receita e aproximadamente 1.600 salgados. Nos recheios, o rendimento pode começar estimado e ser corrigido com as produções reais.</p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="xl:col-span-2"><Label>Ficha</Label><select className={selectClass + " mt-1"} value={config.ficha_id} onChange={(e) => selecionarConfig(e.target.value)}><option value="">Selecione</option>{fichas.map((f) => <option key={f.id} value={f.id}>{f.categoria === "massa" ? "Massa" : "Recheio"} · {f.nome}</option>)}</select></div>
        <div><Label>Rendimento por receita</Label><Input type="number" min="0.001" step="0.001" value={config.rendimento} onChange={(e) => setConfig({ ...config, rendimento: e.target.value })} /></div>
        <div><Label>Unidade</Label><select className={selectClass + " mt-1"} value={config.unidade} onChange={(e) => setConfig({ ...config, unidade: e.target.value })}><option value="kg">kg</option><option value="g">g</option><option value="l">l</option><option value="ml">ml</option><option value="un">un</option></select></div>
        <div><Label>Capacidade aproximada</Label><Input type="number" min="0" step="1" placeholder={fichaConfig?.categoria === "massa" ? "1600 salgados" : "Opcional"} value={config.capacidade} onChange={(e) => setConfig({ ...config, capacidade: e.target.value })} /></div>
        <div className="flex items-end"><Button className="w-full" disabled={saving} onClick={salvarRendimento}><Save className="size-4" />Salvar</Button></div>
        <div className="md:col-span-2 xl:col-span-6"><Label>Modo de preparo</Label><Input value={config.modo} onChange={(e) => setConfig({ ...config, modo: e.target.value })} placeholder="Resumo do processo ou referência operacional" /></div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Registrar produção de massa ou recheio</CardTitle>
        <p className="text-sm text-muted-foreground">A operação baixa os ingredientes ou preparos componentes uma única vez e cria um lote de estoque intermediário.</p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="xl:col-span-2"><Label>Preparo</Label><select className={selectClass + " mt-1"} value={producao.ficha_id} onChange={(e) => selecionarProducao(e.target.value)}><option value="">Selecione</option>{fichas.map((f) => <option key={f.id} value={f.id}>{f.categoria === "massa" ? "Massa" : "Recheio"} · {f.nome}</option>)}</select></div>
        <div><Label>Receitas feitas</Label><Input type="number" min="0.01" step="0.01" value={producao.receitas} onChange={(e) => setProducao({ ...producao, receitas: e.target.value })} /></div>
        <div><Label>Rendimento real</Label><Input type="number" min="0.001" step="0.001" value={producao.quantidade_real} onChange={(e) => setProducao({ ...producao, quantidade_real: e.target.value })} /></div>
        <div><Label>Unidade</Label><select className={selectClass + " mt-1"} value={producao.unidade} onChange={(e) => setProducao({ ...producao, unidade: e.target.value })}><option value="kg">kg</option><option value="g">g</option><option value="l">l</option><option value="ml">ml</option><option value="un">un</option></select></div>
        <div><Label>Data</Label><Input type="date" value={producao.data} onChange={(e) => setProducao({ ...producao, data: e.target.value })} /></div>
        <div className="md:col-span-2 xl:col-span-5"><Label>Observações</Label><Input value={producao.observacoes} onChange={(e) => setProducao({ ...producao, observacoes: e.target.value })} placeholder="Perdas, ponto, sobra ou ocorrência" /></div>
        <div className="flex items-end"><Button className="w-full" disabled={saving || !fichaProducao} onClick={registrarProducao}><PackagePlus className="size-4" />Registrar</Button></div>
      </CardContent>
    </Card>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {estoques.map((item) => <Card key={item.ficha_id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{item.nome}</CardTitle><p className="text-sm text-muted-foreground">{item.categoria === "massa" ? "Massa pronta" : "Recheio pronto"}</p></div><Badge variant="secondary">{Number(item.quantidade_disponivel).toLocaleString("pt-BR")} {item.unidade}</Badge></div></CardHeader><CardContent className="text-sm text-muted-foreground">Última produção: {item.ultima_producao ? new Date(item.ultima_producao + "T12:00:00").toLocaleDateString("pt-BR") : "ainda não registrada"}</CardContent></Card>)}
    </div>

    <Card>
      <CardHeader><CardTitle>Últimos lotes de preparos</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {lotes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma produção intermediária registrada.</p> : lotes.map((lote) => {
          const ficha = fichas.find((f) => f.id === lote.ficha_id)
          return <div key={lote.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"><div><strong>{ficha?.nome ?? "Preparo"}</strong><p className="text-muted-foreground">{lote.codigo} · {new Date(lote.data_producao + "T12:00:00").toLocaleDateString("pt-BR")} · {lote.receitas_produzidas} receita(s)</p></div><div className="text-right"><strong>{lote.quantidade_disponivel} {lote.unidade} disponíveis</strong><p className="text-muted-foreground">Produzido: {lote.quantidade_produzida} {lote.unidade}</p></div></div>
        })}
      </CardContent>
    </Card>
  </div>
}
