"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Package, Plus, ShoppingCart, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { carregarPermissoes, type Permissoes } from "@/lib/access-control"
import { isSocio, type Colaborador } from "@/lib/types"
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
  const [gerandoExemplo, setGerandoExemplo] = useState(false)
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [receitas, setReceitas] = useState<Receita[]>([])
  const [planos, setPlanos] = useState<Plano[]>([])
  const [necessidades, setNecessidades] = useState<Necessidade[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])

  const [novoInsumo, setNovoInsumo] = useState({ nome: "", unidade: "kg", estoque_atual: "", estoque_minimo: "" })
  const [novoProduto, setNovoProduto] = useState({ nome: "", unidade: "un" })
  const [novaReceita, setNovaReceita] = useState({ produto_id: "", insumo_id: "", quantidade: "" })
  const hoje = new Date()
  const [novoPlano, setNovoPlano] = useState({ data_producao: hoje.toISOString().slice(0, 10), produto_id: "", quantidade: "", observacoes: "" })
  const [mesCalendario, setMesCalendario] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const [diaSelecionado, setDiaSelecionado] = useState(hoje.toISOString().slice(0, 10))
  const [preparo, setPreparo] = useState({ ativo: false, insumo_ids: [] as string[], responsavel_id: "" })

  const abas = useMemo(() => {
    const lista: string[] = []
    if (permissoes.producao_compras) lista.push("compras")
    if (permissoes.producao_estoque) lista.push("estoque")
    if (permissoes.producao_planejamento) lista.push("planejamento")
    return lista
  }, [permissoes])
  const solicitada = searchParams.get("tab") || ""
  const abaInicial = abas.includes(solicitada) ? solicitada : abas[0] || "planejamento"

  const planosPorData = useMemo(() => planos.reduce<Record<string, Plano[]>>((grupo, plano) => {
    grupo[plano.data_producao] = [...(grupo[plano.data_producao] || []), plano]
    return grupo
  }, {}), [planos])

  const diasCalendario = useMemo(() => {
    const ano = mesCalendario.getFullYear()
    const mes = mesCalendario.getMonth()
    const inicio = new Date(ano, mes, 1 - new Date(ano, mes, 1).getDay())
    return Array.from({ length: 42 }, (_, indice) => {
      const data = new Date(inicio)
      data.setDate(inicio.getDate() + indice)
      const chave = [data.getFullYear(), String(data.getMonth() + 1).padStart(2, "0"), String(data.getDate()).padStart(2, "0")].join("-")
      return { data, chave, pertenceAoMes: data.getMonth() === mes }
    })
  }, [mesCalendario])

  const planosSelecionados = planosPorData[diaSelecionado] || []
  const colaboradoresAtivos = colaboradores.filter((p) => p.ativo && !isSocio(p))
  const insumosPreparo = useMemo(() => {
    const ids = new Set(receitas.filter((r) => r.produto_id === novoPlano.produto_id).map((r) => r.insumo_id))
    return insumos.filter((i) => ids.has(i.id))
  }, [insumos, receitas, novoPlano.produto_id])
  const tituloMes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(mesCalendario)

  function navegarMes(direcao: number) {
    setMesCalendario((atual) => new Date(atual.getFullYear(), atual.getMonth() + direcao, 1))
  }

  function selecionarDia(chave: string) {
    setDiaSelecionado(chave)
    setNovoPlano((atual) => ({ ...atual, data_producao: chave }))
  }

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
      supabase.from("colaboradores").select("*").eq("ativo", true).order("nome"),
    ])
    const primeiroErro = consultas.find((item) => item.error)?.error
    if (primeiroErro) toast.error("Não foi possível carregar os dados da Produção.")
    setInsumos((consultas[0].data ?? []) as Insumo[])
    setProdutos((consultas[1].data ?? []) as Produto[])
    setReceitas((consultas[2].data ?? []) as Receita[])
    setPlanos((consultas[3].data ?? []) as Plano[])
    setNecessidades((consultas[4].data ?? []) as Necessidade[])
    setCompras((consultas[5].data ?? []) as Compra[])
    setColaboradores((consultas[6].data ?? []) as Colaborador[])
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

  function alternarInsumoPreparo(insumoId: string) {
    setPreparo((atual) => ({ ...atual, insumo_ids: atual.insumo_ids.includes(insumoId) ? atual.insumo_ids.filter((id) => id !== insumoId) : [...atual.insumo_ids, insumoId] }))
  }

  async function adicionarPlano() {
    if (!novoPlano.produto_id || Number(novoPlano.quantidade) <= 0) return toast.error("Selecione produto e quantidade.")
    const produto = produtos.find((item) => item.id === novoPlano.produto_id)
    const responsavel = colaboradoresAtivos.find((item) => item.id === preparo.responsavel_id)
    const alimentos = insumosPreparo.filter((item) => preparo.insumo_ids.includes(item.id))
    const dataPreparo = new Date(novoPlano.data_producao + "T12:00:00")
    dataPreparo.setDate(dataPreparo.getDate() - 1)
    const dataPreparoISO = dataPreparo.toISOString().slice(0, 10)
    if (preparo.ativo) {
      if (novoPlano.data_producao <= hoje.toISOString().slice(0, 10)) return toast.error("Escolha uma data futura para programar o preparo um dia antes.")
      if (!alimentos.length) return toast.error("Selecione ao menos um alimento para o pré-preparo.")
      if (!responsavel) return toast.error("Selecione o colaborador responsável pelo pré-preparo.")
    }
    setSaving(true)
    let planoId: string | null = null
    try {
      const { data: plano, error: planoError } = await supabase.from("producao_planejamento").insert({ data_producao: novoPlano.data_producao, produto_id: novoPlano.produto_id, quantidade: Number(novoPlano.quantidade), observacoes: novoPlano.observacoes || null }).select("id").single()
      if (planoError) throw planoError
      planoId = plano.id
      if (preparo.ativo && responsavel) {
        const nomes = alimentos.map((item) => item.nome)
        const { data: tarefa, error: tarefaError } = await supabase.from("kanban_tarefas").insert({
          titulo: "Pré-preparo: " + (produto?.nome || "produção"),
          descricao: ["Produção vinculada para " + new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(novoPlano.data_producao + "T12:00:00Z")) + ".", "Preparar: " + nomes.join(", ") + ".", "Quantidade planejada: " + novoPlano.quantidade + " " + (produto?.unidade || "un") + ".", "Referência do planejamento: " + plano.id].join("\n"),
          contexto: "colaboradores", responsavel_id: responsavel.id, responsavel_nome: responsavel.nome, status: "nao_realizado", prazo: dataPreparoISO,
        }).select("id").single()
        if (tarefaError) throw tarefaError
        void fetch("/api/notifications/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "tarefa", id: tarefa.id }) }).catch(() => undefined)
      }
      toast.success(preparo.ativo ? "Produção e pré-preparo enviados ao Kanban." : "Produção planejada.")
      setNovoPlano({ data_producao: novoPlano.data_producao, produto_id: "", quantidade: "", observacoes: "" })
      setPreparo({ ativo: false, insumo_ids: [], responsavel_id: "" })
      await carregar()
    } catch (e) {
      if (planoId) await supabase.from("producao_planejamento").delete().eq("id", planoId)
      toast.error(e instanceof Error ? e.message : "Não foi possível agendar a produção e o pré-preparo.")
    } finally { setSaving(false) }
  }

  async function gerarExemploProducao() {
    setGerandoExemplo(true)
    const idsInsumos = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    const produtoId = crypto.randomUUID()
    const planoIds = [crypto.randomUUID(), crypto.randomUUID()]
    let criouDados = false
    try {
      const { data: existentes, error: consultaError } = await supabase.from("producao_produtos").select("id").ilike("nome", "[EXEMPLO]%").limit(1)
      if (consultaError) throw consultaError
      if (existentes?.length) {
        toast.warning("Os exemplos da Produção já foram criados.")
        return
      }
      const dataEm = (dias: number) => {
        const data = new Date()
        data.setDate(data.getDate() + dias)
        return data.toISOString().slice(0, 10)
      }
      const dataProducao = dataEm(2)
      const segundaData = dataEm(5)
      const { error: insumosError } = await supabase.from("producao_insumos").insert([
        { id: idsInsumos[0], nome: "[EXEMPLO] Massa de mandioca", unidade: "kg", estoque_atual: 2, estoque_minimo: 5 },
        { id: idsInsumos[1], nome: "[EXEMPLO] Queijo", unidade: "kg", estoque_atual: 1, estoque_minimo: 2 },
        { id: idsInsumos[2], nome: "[EXEMPLO] Embalagem", unidade: "un", estoque_atual: 20, estoque_minimo: 100 },
      ])
      if (insumosError) throw insumosError
      criouDados = true
      const { error: produtoError } = await supabase.from("producao_produtos").insert({
        id: produtoId, nome: "[EXEMPLO] Salgado de mandioca com queijo", unidade: "un",
      })
      if (produtoError) throw produtoError
      const { error: receitasError } = await supabase.from("producao_receitas").insert([
        { produto_id: produtoId, insumo_id: idsInsumos[0], quantidade_por_unidade: 0.05 },
        { produto_id: produtoId, insumo_id: idsInsumos[1], quantidade_por_unidade: 0.02 },
        { produto_id: produtoId, insumo_id: idsInsumos[2], quantidade_por_unidade: 1 },
      ])
      if (receitasError) throw receitasError
      const { error: planosError } = await supabase.from("producao_planejamento").insert([
        { id: planoIds[0], data_producao: dataProducao, produto_id: produtoId, quantidade: 100, observacoes: "[EXEMPLO] Produção para demonstrar o cálculo automático dos insumos." },
        { id: planoIds[1], data_producao: segundaData, produto_id: produtoId, quantidade: 50, observacoes: "[EXEMPLO] Segundo lote exibido no calendário mensal." },
      ])
      if (planosError) throw planosError
      const { error: compraError } = await supabase.from("producao_lista_compras").insert({
        insumo_id: idsInsumos[0], data_necessidade: dataProducao, quantidade_necessaria: 3,
        observacoes: "[EXEMPLO] Item gerado para demonstrar a lista de compras.",
      })
      if (compraError) throw compraError
      await carregar()
      setMesCalendario(new Date(dataProducao + "T12:00:00"))
      setDiaSelecionado(dataProducao)
      toast.success("Exemplo completo criado. Confira compras, estoque e calendário.")
    } catch (e) {
      if (criouDados) {
        await supabase.from("producao_lista_compras").delete().eq("insumo_id", idsInsumos[0])
        await supabase.from("producao_planejamento").delete().in("id", planoIds)
        await supabase.from("producao_receitas").delete().eq("produto_id", produtoId)
        await supabase.from("producao_produtos").delete().eq("id", produtoId)
        await supabase.from("producao_insumos").delete().in("id", idsInsumos)
      }
      toast.error(e instanceof Error ? e.message : "Não foi possível criar os exemplos da Produção.")
    } finally {
      setGerandoExemplo(false)
    }
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

      <Card className="mb-5 border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="font-semibold">Quer ver o fluxo completo funcionando?</p>
            <p className="text-sm text-muted-foreground">Crie dados fictícios de produto, receita, estoque, planejamento, necessidades e compras.</p>
          </div>
          <Button onClick={gerarExemploProducao} disabled={gerandoExemplo || saving}>
            {gerandoExemplo ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {gerandoExemplo ? "Criando exemplo..." : "Mostrar exemplo completo"}
          </Button>
        </CardContent>
      </Card>
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
                  <div><Label>Produto</Label><select className={selectClass} value={novoPlano.produto_id} onChange={(e) => { setNovoPlano({ ...novoPlano, produto_id: e.target.value }); setPreparo((atual) => ({ ...atual, insumo_ids: [] })) }}><option value="">Selecione</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                  <div><Label>Quantidade</Label><Input type="number" step="0.001" value={novoPlano.quantidade} onChange={(e) => setNovoPlano({ ...novoPlano, quantidade: e.target.value })} /></div>
                </div>
                <Input placeholder="Observações" value={novoPlano.observacoes} onChange={(e) => setNovoPlano({ ...novoPlano, observacoes: e.target.value })} />
                <div className="rounded-xl border bg-muted/20 p-4">
                  <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={preparo.ativo} onChange={(e) => setPreparo((atual) => ({ ...atual, ativo: e.target.checked }))} /><span><span className="block font-semibold">Preparar alimentos do recheio 1 dia antes</span><span className="block text-xs text-muted-foreground">Cria automaticamente uma tarefa no Kanban do colaborador.</span></span></label>
                  {preparo.ativo && <div className="mt-4 grid gap-4 border-t pt-4">
                    <div><Label>Alimentos que deverão ser preparados</Label>{!novoPlano.produto_id ? <p className="mt-2 text-xs text-muted-foreground">Escolha primeiro o produto.</p> : insumosPreparo.length === 0 ? <p className="mt-2 text-xs text-amber-600">Este produto ainda não possui insumos vinculados à receita.</p> : <div className="mt-2 grid gap-2 sm:grid-cols-2">{insumosPreparo.map((insumo) => <label key={insumo.id} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background p-2.5 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={preparo.insumo_ids.includes(insumo.id)} onChange={() => alternarInsumoPreparo(insumo.id)} /><span>{insumo.nome}</span></label>)}</div>}</div>
                    <div><Label>Colaborador responsável</Label><select className={selectClass + " mt-2"} value={preparo.responsavel_id} onChange={(e) => setPreparo((atual) => ({ ...atual, responsavel_id: e.target.value }))}><option value="">Selecione quem fará o pré-preparo</option>{colaboradoresAtivos.map((colaborador) => <option key={colaborador.id} value={colaborador.id}>{colaborador.nome}{colaborador.funcao ? " · " + colaborador.funcao : ""}</option>)}</select></div>
                    {novoPlano.data_producao && <p className="rounded-lg bg-primary/10 p-3 text-xs text-primary">A tarefa será lançada para {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(new Date(novoPlano.data_producao + "T12:00:00Z").getTime() - 86400000))}.</p>}
                  </div>}
                </div>
                <Button onClick={adicionarPlano} disabled={saving}><CalendarDays className="size-4" />{preparo.ativo ? "Agendar produção e enviar ao Kanban" : "Lançar no planejamento"}</Button>
              </CardContent>
            </Card>
          </div>
          <Card className="overflow-hidden">
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><CardTitle>Calendário mensal</CardTitle><p className="mt-1 text-sm text-muted-foreground">Selecione um dia para conferir ou programar a produção.</p></div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => navegarMes(-1)} aria-label="Mês anterior"><ChevronLeft className="size-4" /></Button>
                  <p className="min-w-36 text-center font-semibold capitalize">{tituloMes}</p>
                  <Button variant="outline" size="icon" onClick={() => navegarMes(1)} aria-label="Próximo mês"><ChevronRight className="size-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="overflow-x-auto"><div className="min-w-[680px]">
                <div className="grid grid-cols-7 border-b pb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia) => <div key={dia}>{dia}</div>)}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1.5">
                  {diasCalendario.map(({ data, chave, pertenceAoMes }) => {
                    const producoes = planosPorData[chave] || []
                    const selecionado = chave === diaSelecionado
                    const atual = chave === hoje.toISOString().slice(0, 10)
                    return <button type="button" key={chave} onClick={() => selecionarDia(chave)} className={`min-h-28 rounded-xl border p-2 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 ${selecionado ? "border-primary bg-primary/10 ring-1 ring-primary" : ""} ${pertenceAoMes ? "" : "opacity-40"}`}>
                      <span className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold ${atual ? "bg-primary text-primary-foreground" : ""}`}>{data.getDate()}</span>
                      <div className="mt-1 grid gap-1">
                        {producoes.slice(0, 2).map((plano) => {
                          const produto = produtos.find((item) => item.id === plano.produto_id)
                          return <span key={plano.id} className="truncate rounded-md bg-primary px-1.5 py-1 text-[11px] font-medium text-primary-foreground">{produto?.nome || "Produção"} · {plano.quantidade}</span>
                        })}
                        {producoes.length > 2 && <span className="text-[11px] font-medium text-primary">+{producoes.length - 2} produções</span>}
                      </div>
                    </button>
                  })}
                </div>
              </div></div>
              <aside className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Dia selecionado</p>
                <h3 className="mt-1 text-lg font-semibold">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(diaSelecionado + "T12:00:00Z"))}</h3>
                <Button className="mt-3 w-full" variant="outline" onClick={() => setNovoPlano((atual) => ({ ...atual, data_producao: diaSelecionado }))}><Plus className="size-4" />Programar neste dia</Button>
                <div className="mt-4 grid gap-3">
                  {planosSelecionados.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma produção marcada neste dia.</p>}
                  {planosSelecionados.map((plano) => {
                    const produto = produtos.find((item) => item.id === plano.produto_id)
                    return <div key={plano.id} className="rounded-lg border bg-background p-3"><p className="font-semibold">{produto?.nome || "Produto"}</p><p className="text-sm text-muted-foreground">{plano.quantidade} {produto?.unidade} · {plano.status}</p>{plano.observacoes && <p className="mt-2 text-xs">{plano.observacoes}</p>}</div>
                  })}
                </div>
              </aside>
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
