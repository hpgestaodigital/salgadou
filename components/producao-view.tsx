"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Package, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { carregarPermissoes, type Permissoes } from "@/lib/access-control"
import { isSocio, type Colaborador } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Insumo = { id: string; nome: string; unidade: string; estoque_atual: number; estoque_minimo: number; ativo: boolean }
type Produto = { id: string; nome: string; unidade: string; ativo: boolean }
type Receita = { produto_id: string; insumo_id: string; quantidade_por_unidade: number }
type Plano = { id: string; data_producao: string; produto_id: string; quantidade: number; status: string; observacoes: string | null; pre_preparo_necessario: boolean; pre_preparo_tarefa_id: string | null; pre_preparo_status: "nao_realizado" | "em_andamento" | "concluido"; quantidade_produzida: number | null; caixas_produzidas: number | null; caixas_empacotadas: number | null; porcoes_empacotadas: number | null; concluido_em: string | null; observacoes_fechamento: string | null }
type Necessidade = { data_producao: string; insumo_id: string; insumo: string; unidade: string; quantidade_necessaria: number; estoque_atual: number; quantidade_a_comprar: number }
type Compra = { id: string; insumo_id: string; data_necessidade: string | null; quantidade_necessaria: number; quantidade_comprada: number; status: string; observacoes: string | null; origem_automatica?: boolean }
type Consumo = { planejamento_id: string; insumo_id: string; quantidade_planejada: number; quantidade_utilizada: number }
type EstoqueFinal = { produto_id: string; caixas_congeladas: number; porcoes_empacotadas: number; updated_at: string }
type ReservaInsumo = { planejamento_id: string; insumo_id: string; quantidade_reservada: number; data_producao: string }

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
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [consumosRegistrados, setConsumosRegistrados] = useState<Consumo[]>([])
  const [estoqueFinal, setEstoqueFinal] = useState<EstoqueFinal[]>([])
  const [reservasInsumos, setReservasInsumos] = useState<ReservaInsumo[]>([])

  const [novoInsumo, setNovoInsumo] = useState({ nome: "", unidade: "kg", estoque_atual: "", estoque_minimo: "" })
  const [novoProduto, setNovoProduto] = useState({ nome: "", unidade: "un" })
  const [novaReceita, setNovaReceita] = useState({ produto_id: "", insumo_id: "", quantidade: "" })
  const hoje = new Date()
  const [novoPlano, setNovoPlano] = useState({ data_producao: hoje.toISOString().slice(0, 10), produto_id: "", quantidade: "", observacoes: "" })
  const [mesCalendario, setMesCalendario] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const [diaSelecionado, setDiaSelecionado] = useState(hoje.toISOString().slice(0, 10))
  const [preparo, setPreparo] = useState({ ativo: false, insumo_ids: [] as string[], responsavel_id: "" })
  const [fechamentoPlanoId, setFechamentoPlanoId] = useState<string | null>(null)
  const [fechamento, setFechamento] = useState({ quantidade_produzida: "", caixas_produzidas: "", observacoes: "", consumos: {} as Record<string, string> })
  const [empacotamentoPlanoId, setEmpacotamentoPlanoId] = useState<string | null>(null)
  const [empacotamento, setEmpacotamento] = useState({ caixas: "", porcoes: "", observacoes: "" })
  const [abaAtiva, setAbaAtiva] = useState("")

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
  const insumosAtivos = insumos.filter((item) => item.ativo)
  const comprasAutomaticas = compras.filter((item) => item.origem_automatica)
  const comprasAnteriores = compras.filter((item) => !item.origem_automatica)
  const insumosPreparo = useMemo(() => {
    const ids = new Set(receitas.filter((r) => r.produto_id === novoPlano.produto_id).map((r) => r.insumo_id))
    return insumos.filter((i) => i.ativo && ids.has(i.id))
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
      supabase.from("producao_consumos").select("*"),
      supabase.from("producao_estoque_final").select("*").order("updated_at", { ascending: false }),
      supabase.from("producao_reservas_insumos").select("*").order("data_producao"),
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
    setConsumosRegistrados((consultas[7].data ?? []) as Consumo[])
    setEstoqueFinal((consultas[8].data ?? []) as EstoqueFinal[])
    setReservasInsumos((consultas[9].data ?? []) as ReservaInsumo[])
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
      const { data: plano, error: planoError } = await supabase.from("producao_planejamento").insert({ data_producao: novoPlano.data_producao, produto_id: novoPlano.produto_id, quantidade: Number(novoPlano.quantidade), observacoes: novoPlano.observacoes || null, pre_preparo_necessario: preparo.ativo }).select("id").single()
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
        const { error: vinculoError } = await supabase.from("producao_planejamento").update({ pre_preparo_tarefa_id: tarefa.id, pre_preparo_status: "nao_realizado" }).eq("id", plano.id)
        if (vinculoError) throw vinculoError
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

  async function excluirInsumo(insumo: Insumo) {
    if (!window.confirm(`Excluir “${insumo.nome}”?\n\nReceitas, reservas e compras dependentes serão removidas. Se já houver consumo registrado, o insumo será arquivado para preservar o histórico. Esta ação ficará registrada no Histórico do ERP.`)) return
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc("excluir_insumo_producao", { insumo_id_param: insumo.id })
      if (error) throw error
      toast.success(data === "arquivado" ? "Insumo arquivado; o histórico de consumo foi preservado." : "Insumo e dependências operacionais excluídos.")
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o insumo.")
    } finally { setSaving(false) }
  }

  async function excluirCompra(compra: Compra) {
    const insumo = insumos.find((item) => item.id === compra.insumo_id)
    const origem = compra.origem_automatica ? "Esta compra foi calculada automaticamente e poderá reaparecer se a falta de estoque continuar." : "Este é um lançamento manual ou anterior."
    if (!window.confirm(`Excluir a compra de ${insumo?.nome || "insumo"}?\n\n${origem}\nA exclusão ficará registrada no Histórico do ERP.`)) return
    setSaving(true)
    try {
      const { error } = await supabase.from("producao_lista_compras").delete().eq("id", compra.id)
      if (error) throw error
      toast.success("Item removido da lista de compras.")
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a compra.")
    } finally { setSaving(false) }
  }

  async function alterarPrePreparo(plano: Plano, concluido: boolean) {
    setSaving(true)
    try {
      const { error } = await supabase.rpc("definir_status_pre_preparo", {
        planejamento_id_param: plano.id,
        status_param: concluido ? "concluido" : "nao_realizado",
      })
      if (error) throw error
      toast.success(concluido ? "Pré-preparo concluído e Kanban atualizado." : "Check desfeito e tarefa reaberta no Kanban.")
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o pré-preparo.")
    } finally { setSaving(false) }
  }

  function abrirFechamento(plano: Plano) {
    const consumos = Object.fromEntries(receitas.filter((item) => item.produto_id === plano.produto_id).map((item) => [item.insumo_id, String(Number(item.quantidade_por_unidade) * Number(plano.quantidade))]))
    setFechamentoPlanoId(plano.id)
    setFechamento({ quantidade_produzida: String(plano.quantidade_produzida ?? plano.quantidade), caixas_produzidas: String(plano.caixas_produzidas ?? ""), observacoes: plano.observacoes_fechamento ?? "", consumos })
  }

  async function concluirProducao(plano: Plano) {
    const quantidadeProduzida = Number(fechamento.quantidade_produzida)
    const caixasProduzidas = Number(fechamento.caixas_produzidas)
    if (!Number.isFinite(quantidadeProduzida) || quantidadeProduzida < 0) return toast.error("Informe quantas unidades foram produzidas.")
    if (!Number.isFinite(caixasProduzidas) || caixasProduzidas < 0) return toast.error("Informe quantas caixas renderam.")
    const itensReceita = receitas.filter((item) => item.produto_id === plano.produto_id)
    const consumos = itensReceita.map((item) => ({
      insumo_id: item.insumo_id,
      quantidade_planejada: Number(item.quantidade_por_unidade) * Number(plano.quantidade),
      quantidade_utilizada: Number(fechamento.consumos[item.insumo_id] || 0),
    }))
    if (consumos.some((item) => !Number.isFinite(item.quantidade_utilizada) || item.quantidade_utilizada < 0)) return toast.error("Confira as quantidades de material utilizado.")
    setSaving(true)
    try {
      const { error } = await supabase.rpc("registrar_saida_maquina", {
        planejamento_id_param: plano.id,
        estimativa_unidades_param: quantidadeProduzida,
        caixas_produzidas_param: caixasProduzidas,
        observacoes_param: fechamento.observacoes,
        consumos_param: consumos,
      })
      if (error) throw error
      toast.success("Saída da máquina registrada. Lote aguardando congelamento e empacotamento.")
      setFechamentoPlanoId(null)
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a produção.")
    } finally { setSaving(false) }
  }

  function abrirEmpacotamento(plano: Plano) {
    setEmpacotamentoPlanoId(plano.id)
    setEmpacotamento({ caixas: String(plano.caixas_empacotadas ?? plano.caixas_produzidas ?? ""), porcoes: String(plano.porcoes_empacotadas ?? ""), observacoes: "" })
  }

  function abrirEmpacotamentoPeloEstoque(produtoId: string) {
    const plano = planos
      .filter((item) => item.produto_id === produtoId && Number(item.caixas_produzidas ?? 0) > Number(item.caixas_empacotadas ?? 0))
      .sort((a, b) => a.data_producao.localeCompare(b.data_producao))[0]
    if (!plano) return toast.error("Nenhum lote deste produto está aguardando empacotamento.")
    setAbaAtiva("planejamento")
    setDiaSelecionado(plano.data_producao)
    setMesCalendario(new Date(`${plano.data_producao}T12:00:00`))
    abrirEmpacotamento(plano)
    setTimeout(() => document.getElementById("calendario-producao")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100)
  }

  async function concluirEmpacotamento(plano: Plano) {
    const caixas = Number(empacotamento.caixas)
    const porcoes = Number(empacotamento.porcoes)
    if (!Number.isFinite(caixas) || caixas < 0) return toast.error("Informe quantas caixas foram empacotadas.")
    if (!Number.isFinite(porcoes) || porcoes < 0) return toast.error("Informe quantas porções renderam.")
    if (caixas > Number(plano.caixas_produzidas ?? 0)) return toast.error("As caixas empacotadas não podem superar as caixas produzidas.")
    setSaving(true)
    try {
      const { error } = await supabase.rpc("concluir_empacotamento", {
        planejamento_id_param: plano.id,
        caixas_empacotadas_param: caixas,
        porcoes_empacotadas_param: porcoes,
        observacoes_param: empacotamento.observacoes,
      })
      if (error) throw error
      toast.success("Empacotamento concluído e rendimento final registrado.")
      setEmpacotamentoPlanoId(null)
      await carregar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir o empacotamento.")
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" />Carregando Produção...</div>
  if (abas.length === 0) return <Card className="p-6"><p>Seu usuário não possui acesso ao módulo de Produção.</p></Card>

  return (
    <div>
      <PageHeader title="Produção" description="Planeje o que será produzido, confira os insumos e organize as compras." />

      <Tabs value={abaAtiva || abaInicial} onValueChange={setAbaAtiva}>
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
                  {item.quantidade_a_comprar > 0 ? <Badge variant="secondary">Falta prevista: {item.quantidade_a_comprar} {item.unidade}</Badge> : <Badge variant="outline">Estoque suficiente</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Lista de compras</CardTitle><p className="text-sm text-muted-foreground">As compras automáticas são criadas a partir das reservas e do estoque mínimo. Registros antigos permanecem separados para conferência.</p></CardHeader>
            <CardContent className="grid gap-5">
              {compras.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item pendente.</p>}
              {comprasAutomaticas.length > 0 && <section><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Compras geradas automaticamente</h3><Badge variant="secondary">{comprasAutomaticas.length} item(ns)</Badge></div><div className="grid gap-2">{comprasAutomaticas.map((compra) => {
                const insumo = insumos.find((item) => item.id === compra.insumo_id)
                return <div key={compra.id} className="rounded-xl border border-primary/25 bg-primary/5 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{insumo?.nome || "Insumo"}</p><Badge variant="secondary" className="mt-1">Automática</Badge></div><Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => excluirCompra(compra)} aria-label={`Excluir compra de ${insumo?.nome || "insumo"}`}><Trash2 className="size-4" /></Button></div><p className="mt-1 text-sm text-muted-foreground">Comprar {compra.quantidade_necessaria} {insumo?.unidade} · necessário em {compra.data_necessidade || "data não definida"}</p><p className="mt-1 text-xs text-muted-foreground">Motivo: reserva da produção ou estoque abaixo do mínimo.</p></div>
              })}</div></section>}
              {comprasAnteriores.length > 0 && <section><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Lançamentos anteriores ou manuais</h3><Badge variant="outline">{comprasAnteriores.length} item(ns)</Badge></div><div className="grid gap-2">{comprasAnteriores.map((compra) => {
                const insumo = insumos.find((item) => item.id === compra.insumo_id)
                return <div key={compra.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{insumo?.nome || "Insumo"}</p><Badge variant="outline" className="mt-1">Manual/anterior</Badge></div><Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => excluirCompra(compra)} aria-label={`Excluir compra de ${insumo?.nome || "insumo"}`}><Trash2 className="size-4" /></Button></div><p className="mt-1 text-sm text-muted-foreground">{compra.quantidade_necessaria} {insumo?.unidade} · {compra.status} · necessário em {compra.data_necessidade || "data não definida"}</p></div>
              })}</div></section>}
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
            {insumosAtivos.map((item) => <EstoqueCard key={item.id} item={item} reservado={reservasInsumos.filter((reserva) => reserva.insumo_id === item.id).reduce((total, reserva) => total + Number(reserva.quantidade_reservada), 0)} onSave={ajustarEstoque} onDelete={excluirInsumo} />)}
          </div>
          <Card>
            <CardHeader><CardTitle>Insumos reservados para produções</CardTitle><p className="text-sm text-muted-foreground">O material continua no estoque físico, mas já está comprometido com uma produção marcada.</p></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {reservasInsumos.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground md:col-span-2">Nenhum insumo reservado no momento.</p>}
              {reservasInsumos.map((reserva) => {
                const insumo = insumos.find((item) => item.id === reserva.insumo_id)
                const plano = planos.find((item) => item.id === reserva.planejamento_id)
                const produto = produtos.find((item) => item.id === plano?.produto_id)
                return <div key={`${reserva.planejamento_id}-${reserva.insumo_id}`} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{insumo?.nome || "Insumo"}</p><p className="text-xs text-muted-foreground">Reservado para {produto?.nome || "produção"}</p></div><Badge variant="secondary">{reserva.quantidade_reservada} {insumo?.unidade}</Badge></div><p className="mt-2 text-xs font-medium text-primary">Produção de {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${reserva.data_producao}T12:00:00Z`))}</p></div>
              })}
            </CardContent>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Caixas congeladas por produto</CardTitle><p className="text-sm text-muted-foreground">Produções que já saíram da máquina e ainda aguardam empacotamento.</p></CardHeader>
              <CardContent className="grid gap-2">
                {estoqueFinal.filter((item) => Number(item.caixas_congeladas) > 0).length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma caixa congelada aguardando empacotamento.</p>}
                {estoqueFinal.filter((item) => Number(item.caixas_congeladas) > 0).map((item) => {
                  const produto = produtos.find((produtoItem) => produtoItem.id === item.produto_id)
                  const estimativaUnidades = planos.filter((plano) => plano.produto_id === item.produto_id && Number(plano.caixas_produzidas ?? 0) > Number(plano.caixas_empacotadas ?? 0)).reduce((total, plano) => {
                    const caixasProduzidas = Number(plano.caixas_produzidas ?? 0)
                    const caixasRestantes = caixasProduzidas - Number(plano.caixas_empacotadas ?? 0)
                    return total + (caixasProduzidas > 0 ? Number(plano.quantidade_produzida ?? 0) * (caixasRestantes / caixasProduzidas) : 0)
                  }, 0)
                  return <div key={item.produto_id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{produto?.nome || "Produto"}</p><p className="mt-1 text-xs font-medium text-sky-400">Congelando · aguardando empacotamento</p></div><Badge variant="secondary" className="shrink-0 text-sm">{item.caixas_congeladas} caixa(s)</Badge></div><p className="mt-2 text-xs text-muted-foreground">Estimativa: {Math.round(estimativaUnidades)} unidades · {item.caixas_congeladas} caixa(s).</p><Button className="mt-3 w-full" size="sm" onClick={() => abrirEmpacotamentoPeloEstoque(item.produto_id)}><Check className="size-4" />Registrar empacotamento</Button></div>
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Porções empacotadas por produto</CardTitle><p className="text-sm text-muted-foreground">Estoque de produto final gerado automaticamente no fechamento do empacotamento.</p></CardHeader>
              <CardContent className="grid gap-2">
                {estoqueFinal.filter((item) => Number(item.porcoes_empacotadas) > 0).length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma porção empacotada registrada.</p>}
                {estoqueFinal.filter((item) => Number(item.porcoes_empacotadas) > 0).map((item) => {
                  const produto = produtos.find((produtoItem) => produtoItem.id === item.produto_id)
                  return <div key={item.produto_id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-semibold">{produto?.nome || "Produto"}</p><p className="text-xs text-muted-foreground">Produto final empacotado</p></div><Badge className="text-sm">{item.porcoes_empacotadas} porção(ões)</Badge></div>
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="planejamento" className="mt-5 grid gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Produtos e receitas</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 sm:grid-cols-[1fr_170px_auto]">
                  <Input placeholder="Novo produto" value={novoProduto.nome} onChange={(e) => setNovoProduto({ ...novoProduto, nome: e.target.value })} />
                  <select aria-label="Unidade do produto" className={selectClass} value={novoProduto.unidade} onChange={(e) => setNovoProduto({ ...novoProduto, unidade: e.target.value })}>
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilograma (kg)</option>
                    <option value="g">Grama (g)</option>
                    <option value="l">Litro (l)</option>
                    <option value="ml">Mililitro (ml)</option>
                    <option value="pct">Pacote (pct)</option>
                    <option value="cx">Caixa (cx)</option>
                  </select>
                  <Button onClick={adicionarProduto}>Adicionar</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <select className={selectClass} value={novaReceita.produto_id} onChange={(e) => setNovaReceita({ ...novaReceita, produto_id: e.target.value })}><option value="">Produto</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
                  <select className={selectClass} value={novaReceita.insumo_id} onChange={(e) => setNovaReceita({ ...novaReceita, insumo_id: e.target.value })}><option value="">Insumo</option>{insumosAtivos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
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
          <Card id="calendario-producao" className="scroll-mt-6 overflow-hidden">
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
                    const receitaDoProduto = receitas.filter((item) => item.produto_id === plano.produto_id)
                    const consumosDoPlano = consumosRegistrados.filter((item) => item.planejamento_id === plano.id)
                    const preparoConcluido = plano.pre_preparo_status === "concluido"
                    return <div key={plano.id} className="rounded-lg border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="font-semibold">{produto?.nome || "Produto"}</p><p className="text-sm text-muted-foreground">Planejado: {plano.quantidade} {produto?.unidade} · {plano.status === "concluido" ? "Concluído" : plano.status === "em_producao" ? "Aguardando empacotamento" : "Planejado"}</p></div>
                        {plano.status === "concluido" && <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />}
                      </div>
                      {plano.pre_preparo_necessario && <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/25 p-2.5 text-sm">
                        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={preparoConcluido} disabled={saving || !plano.pre_preparo_tarefa_id} onChange={(event) => alterarPrePreparo(plano, event.target.checked)} />
                        <span><span className="block font-semibold">Pré-preparo concluído</span><span className="block text-xs text-muted-foreground">Status atual: {plano.pre_preparo_status === "em_andamento" ? "Em andamento" : preparoConcluido ? "Concluído" : "Não realizado"}. Sincronizado com o Kanban.</span></span>
                      </label>}
                      {plano.observacoes && <p className="mt-2 text-xs">{plano.observacoes}</p>}
                      {plano.status === "concluido" && <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-xs"><p className="font-semibold text-emerald-500">Empacotamento concluído: {plano.porcoes_empacotadas ?? 0} porções</p><p className="mt-1">Saída da máquina: aproximadamente {plano.quantidade_produzida ?? 0} unidades em {plano.caixas_produzidas ?? 0} caixas.</p><p>Empacotadas: {plano.caixas_empacotadas ?? 0} caixas.</p>{consumosDoPlano.length > 0 && <div className="mt-2 grid gap-1 border-t border-emerald-500/15 pt-2">{consumosDoPlano.map((consumo) => { const insumo = insumos.find((item) => item.id === consumo.insumo_id); return <p key={consumo.insumo_id}>{insumo?.nome || "Insumo"}: <strong>{consumo.quantidade_utilizada} {insumo?.unidade}</strong> <span className="text-muted-foreground">(previsto {consumo.quantidade_planejada})</span></p> })}</div>}{plano.observacoes_fechamento && <p className="mt-2 text-muted-foreground">{plano.observacoes_fechamento}</p>}</div>}
                      {plano.status === "planejado" && <Button className="mt-3 w-full" size="sm" onClick={() => abrirFechamento(plano)}><Package className="size-4" />Registrar saída da máquina</Button>}
                      {plano.status === "em_producao" && <div className="mt-3 grid gap-2"><div className="rounded-lg bg-sky-500/10 p-3 text-xs"><p className="font-semibold text-sky-400">Congelando · aguardando empacotamento</p><p className="mt-1">Estimativa: {plano.quantidade_produzida ?? 0} unidades · {plano.caixas_produzidas ?? 0} caixas.</p></div><Button className="w-full" size="sm" onClick={() => abrirEmpacotamento(plano)}><Check className="size-4" />Registrar empacotamento</Button></div>}
                      {fechamentoPlanoId === plano.id && plano.status === "planejado" && <div className="mt-3 grid gap-3 rounded-lg border bg-muted/20 p-3">
                        <div><Label>Estimativa de unidades entregues pela máquina</Label><Input type="number" min="0" step="1" value={fechamento.quantidade_produzida} onChange={(event) => setFechamento((atual) => ({ ...atual, quantidade_produzida: event.target.value }))} /></div>
                        <div><Label>Quantas caixas renderam</Label><Input type="number" min="0" step="0.001" value={fechamento.caixas_produzidas} onChange={(event) => setFechamento((atual) => ({ ...atual, caixas_produzidas: event.target.value }))} /></div>
                        <div className="grid gap-2"><Label>Material realmente utilizado</Label>{receitaDoProduto.length === 0 ? <p className="text-xs text-muted-foreground">Este produto ainda não possui uma receita cadastrada.</p> : receitaDoProduto.map((receita) => {
                          const insumo = insumos.find((item) => item.id === receita.insumo_id)
                          const planejado = Number(receita.quantidade_por_unidade) * Number(plano.quantidade)
                          return <div key={receita.insumo_id} className="grid grid-cols-[1fr_110px] items-end gap-2"><div><p className="text-xs font-medium">{insumo?.nome || "Insumo"}</p><p className="text-[11px] text-muted-foreground">Previsto: {planejado} {insumo?.unidade}</p></div><Input aria-label={`Quantidade utilizada de ${insumo?.nome || "insumo"}`} type="number" min="0" step="0.0001" value={fechamento.consumos[receita.insumo_id] ?? ""} onChange={(event) => setFechamento((atual) => ({ ...atual, consumos: { ...atual.consumos, [receita.insumo_id]: event.target.value } }))} /></div>
                        })}</div>
                        <div><Label>Observações da saída da máquina</Label><Input placeholder="Perdas, ajustes ou observações" value={fechamento.observacoes} onChange={(event) => setFechamento((atual) => ({ ...atual, observacoes: event.target.value }))} /></div>
                        <div className="flex gap-2"><Button className="flex-1" size="sm" disabled={saving} onClick={() => concluirProducao(plano)}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Package className="size-4" />}Enviar para congelamento</Button><Button size="sm" variant="outline" onClick={() => setFechamentoPlanoId(null)}>Cancelar</Button></div>
                      </div>}
                      {empacotamentoPlanoId === plano.id && plano.status === "em_producao" && <div className="mt-3 grid gap-3 rounded-lg border bg-muted/20 p-3">
                        <div><Label>Caixas usadas no empacotamento</Label><Input type="number" min="0" max={plano.caixas_produzidas ?? undefined} step="0.001" value={empacotamento.caixas} onChange={(event) => setEmpacotamento((atual) => ({ ...atual, caixas: event.target.value }))} /><p className="mt-1 text-[11px] text-muted-foreground">Disponíveis: {plano.caixas_produzidas ?? 0} caixas congeladas.</p></div>
                        <div><Label>Quantas porções renderam</Label><Input type="number" min="0" step="1" value={empacotamento.porcoes} onChange={(event) => setEmpacotamento((atual) => ({ ...atual, porcoes: event.target.value }))} /></div>
                        <div><Label>Observações do empacotamento</Label><Input placeholder="Sobras, perdas ou ajustes" value={empacotamento.observacoes} onChange={(event) => setEmpacotamento((atual) => ({ ...atual, observacoes: event.target.value }))} /></div>
                        <div className="flex gap-2"><Button className="flex-1" size="sm" disabled={saving} onClick={() => concluirEmpacotamento(plano)}>{saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Concluir empacotamento</Button><Button size="sm" variant="outline" onClick={() => setEmpacotamentoPlanoId(null)}>Cancelar</Button></div>
                      </div>}
                    </div>
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

function EstoqueCard({ item, reservado, onSave, onDelete }: { item: Insumo; reservado: number; onSave: (item: Insumo, valor: string) => void; onDelete: (item: Insumo) => void }) {
  const [valor, setValor] = useState(String(item.estoque_atual))
  const disponivel = Math.max(0, Number(item.estoque_atual) - reservado)
  const baixo = disponivel <= item.estoque_minimo
  return (
    <Card className={baixo ? "border-amber-500/50" : ""}>
      <CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{item.nome}</CardTitle><Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(item)} aria-label={`Excluir ${item.nome}`}><Trash2 className="size-4" /></Button></div></CardHeader>
      <CardContent>
        <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-2 text-center text-xs"><div><p className="text-muted-foreground">Físico</p><p className="font-semibold">{item.estoque_atual}</p></div><div><p className="text-muted-foreground">Reservado</p><p className="font-semibold text-amber-400">{reservado}</p></div><div><p className="text-muted-foreground">Disponível</p><p className="font-semibold text-primary">{disponivel}</p></div></div>
        <p className="mb-3 text-xs text-muted-foreground">Mínimo recomendado: {item.estoque_minimo} {item.unidade}{baixo ? " · Repor estoque" : ""}</p>
        <div className="flex gap-2"><Input type="number" step="0.001" value={valor} onChange={(e) => setValor(e.target.value)} /><Button variant="outline" onClick={() => onSave(item, valor)}>Salvar</Button></div>
      </CardContent>
    </Card>
  )
}
