"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CalendarDays, Loader2, Package, Plus, ShoppingCart } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { carregarPermissoes, type Permissoes } from "@/lib/access-control"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Insumo = { id: string; nome: string; unidade: string; estoque_atual: number; estoque_minimo: number; ativo: boolean }
type Produto = { id: string; nome: string; unidade: string; ativo: boolean }
type Receita = { produto_id: string; insumo_id: string; quantidade_por_unidade: number }
type Plano = { id: string; data_producao: string; produto_id: string; quantidade: number; status: string; observacoes: string | null }
type Necessidade = { data_producao: string; insumo_id: string; insumo: string; unidade: string; quantidade_necessaria: number; estoque_atual: number; quantidade_a_comprar: number }
type Compra = { id: string; insumo_id: string; data_necessidade: string | null; quantidade_necessaria: number; quantidade_comprada: number; status: string; observacoes: string | null }

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"

export function ProducaoView() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [permissoes, setPermissoes] = useState<Permissoes>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [receitas, setReceitas] = useState<Receita[]>([])
  const [planos, setPlanos] = useState<Plano[]>([])
  const [necessidades, setNecessidades] = useState<Necessidade[]>([])
  const [compras, setCompras] = useState<Compra[]>([])

  const [novoInsumo, setNovoInsumo] = useState({ nome: "", unidade: "kg", estoque_atual: "", estoque_minimo: "" })
  const [novoProduto, setNovoProduto] = useState({ nome: "", unidade: "un" })
  const [novaReceita, setNovaReceita] = useState({ produto_id: "", insumo_id: "", quantidade: "" })
  const [novoPlano, setNovoPlano] = useState({ data_producao: new Date().toISOString().slice(0, 10), produto_id: "", quantidade: "", observacoes: "" })

  const abas = useMemo(() => {
    const lista: string[] = []
    if (permissoes.producao_compras) lista.push("compras")
    if (permissoes.producao_estoque) lista.push("estoque")
    if (permissoes.producao_planejamento) lista.push("planejamento")
    return lista
  }, [permissoes])
  const solicitada = searchParams.get("tab") || ""
  const abaInicial = abas.includes(solicitada) ? solicitada : abas[0] || "planejamento"

  async function carregar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const acessos = await carregarPermissoes(user)
    setPermissoes(acessos)

    const consultas = await Promise.all([
      supabase.from("producao_insumos").select("*").order("nome"),
      supabase.from("producao_produtos").select("*").order("nome"),
      supabase.from("producao_receitas").select("*"),
      supabase.from("producao_planejamento").select("*").order("data_producao"),
      supabase.from("producao_necessidades").select("*").order("data_producao"),
      supabase.from("producao_lista_compras").select("*").order("data_necessidade"),
    ])
    const primeiroErro = consultas.find((item) => item.error)?.error
    if (primeiroErro) toast.error("Não foi possível carregar os dados da Produção.")
    setInsumos((consultas[0].data ?? []) as Insumo[])
    setProdutos((consultas[1].data ?? []) as Produto[])
    setReceitas((consultas[2].data ?? []) as Receita[])
    setPlanos((consultas[3].data ?? []) as Plano[])
    setNecessidades((consultas[4].data ?? []) as Necessidade[])
    setCompras((consultas[5].data ?? []) as Compra[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  async function executar(acao: () => Promise<{ error: unknown }>, sucesso: string) {
    setSaving(true)
    try {
      const { error } = await acao()
      if (error) throw error
      toast.success(sucesso)
      await carregar()
    } catch {
      toast.error("Não foi possível salvar. Confira os dados e tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  async function adicionarInsumo() {
    if (!novoInsumo.nome.trim()) return toast.error("Informe o nome do insumo.")
    await executar(
      () => supabase.from("producao_insumos").insert({
        nome: novoInsumo.nome.trim(), unidade: novoInsumo.unidade,
        estoque_atual: Number(novoInsumo.estoque_atual || 0),
        estoque_minimo: Number(novoInsumo.estoque_minimo || 0),
      }),
      "Insumo adicionado.",
    )
    setNovoInsumo({ nome: "", unidade: "kg", estoque_atual: "", estoque_minimo: "" })
  }

  async function ajustarEstoque(insumo: Insumo, valor: string) {
    await executar(
      () => supabase.from("producao_insumos").update({ estoque_atual: Number(valor), updated_at: new Date().toISOString() }).eq("id", insumo.id),
      "Estoque atualizado.",
    )
  }

  async function adicionarProduto() {
    if (!novoProduto.nome.trim()) return toast.error("Informe o produto.")
    await executar(
      () => supabase.from("producao_produtos").insert({ nome: novoProduto.nome.trim(), unidade: novoProduto.unidade }),
      "Produto adicionado.",
    )
    setNovoProduto({ nome: "", unidade: "un" })
  }

  async function adicionarReceita() {
    if (!novaReceita.produto_id || !novaReceita.insumo_id || Number(novaReceita.quantidade) <= 0) {
      return toast.error("Selecione produto, insumo e quantidade.")
    }
    await executar(
      () => supabase.from("producao_receitas").upsert({
        produto_id: novaReceita.produto_id, insumo_id: novaReceita.insumo_id,
        quantidade_por_unidade: Number(novaReceita.quantidade),
      }),
      "Receita atualizada.",
    )
  }

  async function adicionarPlano() {
    if (!novoPlano.produto_id || Number(novoPlano.quantidade) <= 0) return toast.error("Selecione produto e quantidade.")
    await executar(
      () => supabase.from("producao_planejamento").insert({
        data_producao: novoPlano.data_producao, produto_id: novoPlano.produto_id,
        quantidade: Number(novoPlano.quantidade), observacoes: novoPlano.observacoes || null,
      }),
      "Produção planejada.",
    )
  }

  async function enviarParaCompras(item: Necessidade) {
    if (item.quantidade_a_comprar <= 0) return
    await executar(
      () => supabase.from("producao_lista_compras").insert({
        insumo_id: item.insumo_id, data_necessidade: item.data_producao,
        quantidade_necessaria: item.quantidade_a_comprar,
        observacoes: "Gerado automaticamente pelo planejamento da produção.",
      }),
      "Item adicionado à lista de compras.",
    )
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" />Carregando Produção...</div>
  if (abas.length === 0) return <Card className="p-6"><p>Seu usuário não possui acesso ao módulo de Produção.</p></Card>

  return (
    <div>
      <PageHeader title="Produção" description="Planeje o que será produzido, confira os insumos e organize as compras." />
      <Tabs key={abaInicial} defaultValue={abaInicial}>
        <TabsList className="h-auto flex-wrap justify-start">
          {permissoes.producao_compras && <TabsTrigger value="compras"><ShoppingCart className="size-4" />Lista de compras</TabsTrigger>}
          {permissoes.producao_estoque && <TabsTrigger value="estoque"><Package className="size-4" />Itens em estoque</TabsTrigger>}
          {permissoes.producao_planejamento && <TabsTrigger value="planejamento"><CalendarDays className="size-4" />Planejamento</TabsTrigger>}
        </TabsList>

        <TabsContent value="compras" className="mt-5 grid gap-5">
          <Card>
            <CardHeader><CardTitle>Necessidades calculadas</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              {necessidades.length === 0 && <p className="text-sm text-muted-foreground">Cadastre produtos, receitas e o planejamento para calcular os insumos.</p>}
              {necessidades.map((item) => (
                <div key={item.data_producao + item.insumo_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                  <div><p className="font-semibold">{item.insumo}</p><p className="text-xs text-muted-foreground">{item.data_producao} · Necessário {item.quantidade_necessaria} {item.unidade} · Estoque {item.estoque_atual}</p></div>
                  <Button size="sm" disabled={item.quantidade_a_comprar <= 0 || saving} onClick={() => enviarParaCompras(item)}>
                    <Plus className="size-4" /> Comprar {item.quantidade_a_comprar} {item.unidade}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Lista de compras</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {compras.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item pendente.</p>}
              {compras.map((compra) => {
                const insumo = insumos.find((item) => item.id === compra.insumo_id)
                return <div key={compra.id} className="rounded-xl border p-3"><p className="font-semibold">{insumo?.nome || "Insumo"}</p><p className="text-sm text-muted-foreground">{compra.quantidade_necessaria} {insumo?.unidade} · {compra.status} · necessário em {compra.data_necessidade || "data não definida"}</p></div>
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estoque" className="mt-5 grid gap-5">
          <Card>
            <CardHeader><CardTitle>Novo insumo</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-5">
              <Input className="sm:col-span-2" placeholder="Ex.: Farinha" value={novoInsumo.nome} onChange={(e) => setNovoInsumo({ ...novoInsumo, nome: e.target.value })} />
              <select className={selectClass} value={novoInsumo.unidade} onChange={(e) => setNovoInsumo({ ...novoInsumo, unidade: e.target.value })}><option>kg</option><option>g</option><option>l</option><option>ml</option><option>un</option><option>pct</option><option>cx</option></select>
              <Input type="number" step="0.001" placeholder="Estoque atual" value={novoInsumo.estoque_atual} onChange={(e) => setNovoInsumo({ ...novoInsumo, estoque_atual: e.target.value })} />
              <Button disabled={saving} onClick={adicionarInsumo}><Plus className="size-4" />Adicionar</Button>
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insumos.map((item) => <EstoqueCard key={item.id} item={item} onSave={ajustarEstoque} />)}
          </div>
        </TabsContent>

        <TabsContent value="planejamento" className="mt-5 grid gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Produtos e receitas</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-[1fr_90px_auto] gap-2"><Input placeholder="Novo produto" value={novoProduto.nome} onChange={(e) => setNovoProduto({ ...novoProduto, nome: e.target.value })} /><Input value={novoProduto.unidade} onChange={(e) => setNovoProduto({ ...novoProduto, unidade: e.target.value })} /><Button onClick={adicionarProduto}>Adicionar</Button></div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <select className={selectClass} value={novaReceita.produto_id} onChange={(e) => setNovaReceita({ ...novaReceita, produto_id: e.target.value })}><option value="">Produto</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
                  <select className={selectClass} value={novaReceita.insumo_id} onChange={(e) => setNovaReceita({ ...novaReceita, insumo_id: e.target.value })}><option value="">Insumo</option>{insumos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
                  <Input type="number" step="0.0001" placeholder="Qtd/un" value={novaReceita.quantidade} onChange={(e) => setNovaReceita({ ...novaReceita, quantidade: e.target.value })} />
                  <Button onClick={adicionarReceita}>Vincular</Button>
                </div>
                <p className="text-xs text-muted-foreground">{receitas.length} insumos vinculados às receitas.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Programar produção</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div><Label>Data</Label><Input type="date" value={novoPlano.data_producao} onChange={(e) => setNovoPlano({ ...novoPlano, data_producao: e.target.value })} /></div>
                  <div><Label>Produto</Label><select className={selectClass} value={novoPlano.produto_id} onChange={(e) => setNovoPlano({ ...novoPlano, produto_id: e.target.value })}><option value="">Selecione</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                  <div><Label>Quantidade</Label><Input type="number" step="0.001" value={novoPlano.quantidade} onChange={(e) => setNovoPlano({ ...novoPlano, quantidade: e.target.value })} /></div>
                </div>
                <Input placeholder="Observações" value={novoPlano.observacoes} onChange={(e) => setNovoPlano({ ...novoPlano, observacoes: e.target.value })} />
                <Button onClick={adicionarPlano} disabled={saving}><CalendarDays className="size-4" />Lançar no planejamento</Button>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Calendário de produção</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {planos.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma produção planejada.</p>}
              {planos.map((plano) => {
                const produto = produtos.find((item) => item.id === plano.produto_id)
                return <div key={plano.id} className="rounded-xl border p-4"><p className="text-xs font-bold uppercase tracking-wide text-primary">{plano.data_producao}</p><p className="mt-1 font-semibold">{produto?.nome || "Produto"}</p><p className="text-sm text-muted-foreground">{plano.quantidade} {produto?.unidade} · {plano.status}</p>{plano.observacoes && <p className="mt-2 text-xs">{plano.observacoes}</p>}</div>
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EstoqueCard({ item, onSave }: { item: Insumo; onSave: (item: Insumo, valor: string) => void }) {
  const [valor, setValor] = useState(String(item.estoque_atual))
  const baixo = item.estoque_atual <= item.estoque_minimo
  return (
    <Card className={baixo ? "border-amber-500/50" : ""}>
      <CardHeader className="pb-2"><CardTitle className="text-base">{item.nome}</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">Mínimo: {item.estoque_minimo} {item.unidade}{baixo ? " · Repor estoque" : ""}</p>
        <div className="flex gap-2"><Input type="number" step="0.001" value={valor} onChange={(e) => setValor(e.target.value)} /><Button variant="outline" onClick={() => onSave(item, valor)}>Salvar</Button></div>
      </CardContent>
    </Card>
  )
}
