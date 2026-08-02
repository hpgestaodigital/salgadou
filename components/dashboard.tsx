"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Bike,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Truck,
  Users,
  Wallet,
  ChevronDown,
  UserRound,
} from "lucide-react"
import { useTable } from "@/lib/use-data"
import { isSocio, type Colaborador, type Configuracao, type Escala, type Motoboy, type PagamentoFornecedor, type PagamentoMotoboy } from "@/lib/types"
import type { TarefaKanban } from "@/lib/kanban-data"
import { formatBRL, formatDate, mondayOf, todayISO } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { getNome } from "@/lib/auth-roles"
import { cn } from "@/lib/utils"
import { DashboardProductionCalendar } from "@/components/dashboard-production-calendar"
import { DashboardGoals } from "@/components/dashboard-goals"
import { carregarPermissoes, type Permissoes } from "@/lib/access-control"

type UsuarioVinculo = { usuario_id: string; colaborador_id: string }
type ReuniaoItem = { id: string; descricao: string; responsavel_id: string | null; responsavel_nome: string | null; prazo: string | null; status: string }
type DemandaJuridica = { id: string; titulo: string; responsavel_id: string | null; responsavel_nome: string | null; prazo: string | null; status: string }
type Contrato = { id: string; titulo: string; responsavel_id: string | null; responsavel_nome: string | null; vencimento: string | null; status: string }
type ItemTrabalho = { id: string; titulo: string; origem: string; href: string; prazo: string | null; detalhe?: string }

export function Dashboard() {
  const supabase = createClient()
  const [usuarioNome, setUsuarioNome] = useState("")
  const [usuarioId, setUsuarioId] = useState("")
  const [permissoesDashboard, setPermissoesDashboard] = useState<Permissoes | null>(null)
  const { data: fornecedores } = useTable<PagamentoFornecedor>("pagamentos_fornecedores", {
    column: "vencimento",
    ascending: true,
  })
  const { data: motoboyPagtos } = useTable<PagamentoMotoboy>("pagamentos_motoboys", {
    column: "data",
    ascending: false,
  })
  const { data: colaboradores } = useTable<Colaborador>("colaboradores")
  const { data: motoboys } = useTable<Motoboy>("motoboys")
  const { data: tarefas } = useTable<TarefaKanban>("kanban_tarefas", { column: "prazo", ascending: true })
  const { data: configuracoes } = useTable<Configuracao>("configuracoes")
  const { data: escalas } = useTable<Escala>("escala")
  const { data: vinculos } = useTable<UsuarioVinculo>("usuarios_vinculos")
  const { data: itensReuniao } = useTable<ReuniaoItem>("reunioes_itens", { column: "prazo", ascending: true })
  const { data: demandasJuridicas } = useTable<DemandaJuridica>("demandas_juridicas", { column: "prazo", ascending: true })
  const { data: contratos } = useTable<Contrato>("contratos", { column: "vencimento", ascending: true })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: import("@supabase/supabase-js").User | null } }) => {
      setUsuarioNome(getNome(data.user))
      setUsuarioId(data.user?.id ?? "")
      if (data.user) carregarPermissoes(data.user).then(setPermissoesDashboard)
    })
  }, [supabase])

  const hoje = todayISO()
  const mesAtual = hoje.slice(0, 7)
  const pendentesForn = fornecedores.filter((p) => !p.pago_em)
  const pendentesMoto = motoboyPagtos.filter((p) => !p.pago_em)
  const vencidos = pendentesForn.filter((p) => p.vencimento < hoje)
  const pagosFornMes = fornecedores.filter((p) => p.pago_em?.slice(0, 7) === mesAtual)
  const pagosMotoMes = motoboyPagtos.filter((p) => p.pago_em?.slice(0, 7) === mesAtual)
  const tarefasPendentes = tarefas.filter((t) => t.status !== "concluido")
  const normalizarNome = (nome: string) => nome.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
  const colaboradorVinculadoId = vinculos.find((vinculo) => vinculo.usuario_id === usuarioId)?.colaborador_id ?? null
  const colaboradorVinculado = colaboradores.find((pessoa) => pessoa.id === colaboradorVinculadoId) ?? null
  const nomesDoUsuario = [usuarioNome, colaboradorVinculado?.nome].filter((nome): nome is string => Boolean(nome && !nome.includes("@"))).map(normalizarNome)
  const pertenceAoUsuario = (responsavelId: string | null | undefined, responsavelNome: string | null | undefined) =>
    Boolean((colaboradorVinculadoId && responsavelId === colaboradorVinculadoId) || (responsavelNome && nomesDoUsuario.includes(normalizarNome(responsavelNome))))
  const meuTrabalho: ItemTrabalho[] = [
    ...tarefasPendentes.filter((item) => pertenceAoUsuario(item.responsavel_id, item.responsavel_nome)).map((item) => ({ id: `kanban-${item.id}`, titulo: item.titulo, origem: item.titulo.startsWith("Pré-preparo:") ? "Produção · Pré-preparo" : "Kanban", href: "/kanban", prazo: item.prazo })),
    ...pendentesForn.filter((item) => pertenceAoUsuario(null, item.responsavel)).map((item) => ({ id: `fornecedor-${item.id}`, titulo: `Pagamento: ${item.fornecedor}`, origem: "Fornecedores", href: "/pagamentos-fornecedores", prazo: item.vencimento, detalhe: formatBRL(item.valor) })),
    ...pendentesMoto.filter((item) => pertenceAoUsuario(null, item.responsavel)).map((item) => ({ id: `motoboy-${item.id}`, titulo: `Pagamento: ${item.motoboy_nome || "Motoboy"}`, origem: "Motoboys", href: "/pagamentos-motoboys", prazo: item.data, detalhe: formatBRL(item.total) })),
    ...itensReuniao.filter((item) => item.status !== "concluido" && pertenceAoUsuario(item.responsavel_id, item.responsavel_nome)).map((item) => ({ id: `reuniao-${item.id}`, titulo: item.descricao, origem: "Reuniões", href: "/reunioes", prazo: item.prazo })),
    ...demandasJuridicas.filter((item) => item.status !== "concluido" && pertenceAoUsuario(item.responsavel_id, item.responsavel_nome)).map((item) => ({ id: `juridico-${item.id}`, titulo: item.titulo, origem: "Jurídico", href: "/juridico", prazo: item.prazo })),
    ...contratos.filter((item) => !["assinado", "arquivado"].includes(item.status) && pertenceAoUsuario(item.responsavel_id, item.responsavel_nome)).map((item) => ({ id: `contrato-${item.id}`, titulo: item.titulo, origem: "Contratos", href: "/juridico", prazo: item.vencimento })),
  ].sort((a, b) => (a.prazo ?? "9999-12-31").localeCompare(b.prazo ?? "9999-12-31"))
  const meuTrabalhoAtrasado = meuTrabalho.filter((item) => item.prazo && item.prazo < hoje).length
  const meuTrabalhoPrioritario = meuTrabalho.filter((item) => item.prazo && item.prazo >= hoje).length
  const itensContasVencidas: ItemTrabalho[] = vencidos.map((item) => ({ id: `conta-vencida-${item.id}`, titulo: item.fornecedor, origem: "Conta vencida", href: "/pagamentos-fornecedores", prazo: item.vencimento, detalhe: formatBRL(item.valor) }))
  const itensProximosVencimentos: ItemTrabalho[] = pendentesForn.filter((item) => item.vencimento >= hoje).map((item) => ({ id: `proximo-vencimento-${item.id}`, titulo: item.fornecedor, origem: "Próximo vencimento", href: "/pagamentos-fornecedores", prazo: item.vencimento, detalhe: formatBRL(item.valor) }))

  const resumo = (contexto: "socios" | "colaboradores") => {
    const lista = tarefasPendentes.filter((t) => t.contexto === contexto)
    return { total: lista.length, pessoas: [...new Set(lista.map((t) => t.responsavel_nome))] }
  }
  const socios = resumo("socios")
  const equipe = resumo("colaboradores")
  const colaboradoresAtivos = colaboradores.filter((c) => c.ativo && !isSocio(c))
  const sociosAtivos = colaboradores.filter((c) => c.ativo && isSocio(c))
  const motoboysAtivos = motoboys.filter((m) => m.ativo)
  const idsEscalados = new Set(
    escalas
      .filter((e) => e.semana_inicio === mondayOf(hoje) && ["seg", "ter", "qua", "qui", "sex", "sab", "dom"].some((dia) => Boolean(e[dia as keyof Escala])))
      .map((e) => e.colaborador_id),
  )
  const semanaInicio = mondayOf(hoje)
  const exibirCalendario = permissoesDashboard?.dashboard_calendario_producao ?? true
  const permissoesLegadas = permissoesDashboard as (Record<string, boolean | undefined> | null)
  const exibirFornecedores = permissoesDashboard?.dashboard_fornecedores ?? permissoesLegadas?.dashboard_resumo_financeiro ?? true
  const exibirMotoboys = permissoesDashboard?.dashboard_motoboys ?? permissoesLegadas?.dashboard_resumo_financeiro ?? true
  const exibirEquipe = permissoesDashboard?.dashboard_equipe_ativa ?? true
  const exibirPendenciasColaboradores = permissoesDashboard?.dashboard_pendencias_colaboradores ?? permissoesLegadas?.dashboard_pendencias ?? true
  const exibirPendenciasSocios = permissoesDashboard?.dashboard_pendencias_socios ?? permissoesLegadas?.dashboard_pendencias ?? true
  const podeVerFornecedores = Boolean(permissoesDashboard?.pagamentos_fornecedores ?? true)
  const podeVerMotoboys = Boolean(permissoesDashboard?.pagamentos_motoboys ?? true)
  const exibirFinanceiro = (exibirFornecedores && podeVerFornecedores) || (exibirMotoboys && podeVerMotoboys)

  return (
    <div>
      <PageHeader
        title={configuracoes.find((c) => c.chave === "dashboard_titulo")?.valor || "Dashboard"}
        description={
          configuracoes.find((c) => c.chave === "dashboard_descricao")?.valor ||
          "Acompanhe pagamentos, equipe e prioridades da operação."
        }
      />

      <DashboardGoals />

      <PersonalTasksCard nome={colaboradorVinculado?.nome || usuarioNome} itens={meuTrabalho} proximosVencimentos={itensProximosVencimentos} contasVencidas={itensContasVencidas} vinculado={Boolean(colaboradorVinculadoId)} prioritarias={meuTrabalhoPrioritario} atrasadas={meuTrabalhoAtrasado} mostrarFinanceiro={exibirFinanceiro} />

      {(exibirCalendario || exibirFinanceiro || exibirEquipe) && <section aria-label="Calendário e resumos" className={cn("mt-4 grid items-start gap-4", exibirCalendario && (exibirFinanceiro || exibirEquipe) && "lg:grid-cols-2")}>
        {exibirCalendario && <DashboardProductionCalendar />}

        {(exibirFinanceiro || exibirEquipe) && <div className={cn("grid content-start gap-4", !exibirCalendario && "md:grid-cols-2")}>
          {exibirFornecedores && podeVerFornecedores && <FinanceSwitcherCard title="Fornecedores" options={[
            { id: "a_pagar", label: "A pagar", value: formatBRL(pendentesForn.reduce((s, p) => s + (p.valor ?? 0), 0)), hint: `${pendentesForn.length} conta(s) em aberto`, icon: Truck, tone: "primary", content: <PaymentSupplierList pagamentos={pendentesForn} vazio="Nenhuma conta de fornecedor pendente." /> },
            { id: "pago_mes", label: "Pago no mês", value: formatBRL(pagosFornMes.reduce((s, p) => s + (p.valor ?? 0), 0)), hint: "Pagamentos de fornecedores", icon: CheckCircle2, tone: "success", content: <PaymentSupplierList pagamentos={pagosFornMes} vazio="Nenhum fornecedor pago neste mês." /> },
          ]} />}
          {exibirMotoboys && podeVerMotoboys && <FinanceSwitcherCard title="Motoboys" options={[
            { id: "a_pagar", label: "A pagar", value: formatBRL(pendentesMoto.reduce((s, p) => s + (p.total ?? 0), 0)), hint: `${pendentesMoto.length} pagamento(s) pendente(s)`, icon: Bike, tone: "warning", content: <PaymentMotoboyList pagamentos={pendentesMoto} vazio="Nenhum pagamento de motoboy pendente." /> },
            { id: "pago_mes", label: "Pago no mês", value: formatBRL(pagosMotoMes.reduce((s, p) => s + (p.total ?? 0), 0)), hint: "Pagamentos de motoboys", icon: Wallet, tone: "success", content: <PaymentMotoboyList pagamentos={pagosMotoMes} vazio="Nenhum motoboy pago neste mês." /> },
          ]} />}
          {exibirEquipe && <TeamCard colaboradores={colaboradoresAtivos} socios={sociosAtivos} motoboys={motoboysAtivos} escalados={idsEscalados} semanaInicio={semanaInicio} />}
        </div>}
      </section>}

      {(exibirPendenciasColaboradores || exibirPendenciasSocios) && <section aria-label="Resumo da equipe e pendências" className={cn("mt-4 grid gap-4", exibirPendenciasColaboradores && exibirPendenciasSocios && "md:grid-cols-2")}>
        {exibirPendenciasColaboradores && <ExpandableCard
          label="Pendências — Colaboradores"
          value={`${equipe.total} tarefa(s)`}
          hint={equipe.pessoas.length ? equipe.pessoas.join(" · ") : "Nenhum colaborador com tarefa pendente"}
          icon={CircleDot}
          tone="warning"
        ><TaskList tarefas={tarefasPendentes.filter((t) => t.contexto === "colaboradores")} vazio="Nenhuma pendência de colaborador." /></ExpandableCard>}
        {exibirPendenciasSocios && <ExpandableCard
          label="Pendências — Sócios"
          value={`${socios.total} tarefa(s)`}
          hint={socios.pessoas.length ? socios.pessoas.join(" · ") : "Nenhum sócio com tarefa pendente"}
          icon={CircleDot}
          tone="primary"
        ><TaskList tarefas={tarefasPendentes.filter((t) => t.contexto === "socios")} vazio="Nenhuma pendência de sócio." /></ExpandableCard>}
      </section>}
    </div>
  )
}

function PersonalTasksCard({ nome, itens, proximosVencimentos, contasVencidas, vinculado, prioritarias, atrasadas, mostrarFinanceiro }: { nome: string; itens: ItemTrabalho[]; proximosVencimentos: ItemTrabalho[]; contasVencidas: ItemTrabalho[]; vinculado: boolean; prioritarias: number; atrasadas: number; mostrarFinanceiro: boolean }) {
  const nomeValido = nome && !nome.includes("@")
  const [filtro, setFiltro] = useState<"todas" | "prioritarias" | "atrasadas" | "proximos_vencimentos" | "contas_vencidas">("todas")
  const hoje = todayISO()
  const itensExibidos = filtro === "proximos_vencimentos"
    ? proximosVencimentos
    : filtro === "contas_vencidas"
    ? contasVencidas
    : filtro === "atrasadas"
    ? itens.filter((item) => item.prazo && item.prazo < hoje)
    : filtro === "prioritarias"
      ? itens.filter((item) => item.prazo && item.prazo >= hoje)
      : itens
  const tituloLista = filtro === "proximos_vencimentos" ? "Próximos vencimentos" : filtro === "contas_vencidas" ? "Contas vencidas" : filtro === "atrasadas" ? "Responsabilidades atrasadas" : filtro === "prioritarias" ? "Prioridades no prazo" : "Todas as responsabilidades"
  const alternarFiltro = (novoFiltro: "prioritarias" | "atrasadas" | "proximos_vencimentos" | "contas_vencidas") => setFiltro((atual) => atual === novoFiltro ? "todas" : novoFiltro)
  return <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card">
    <CardContent className="grid gap-5 py-6 md:grid-cols-[minmax(0,1fr)_minmax(280px,.9fr)] md:items-center">
      <div>
        <div className="flex items-center gap-2 text-primary"><UserRound className="size-5" /><p className="text-xs font-bold uppercase tracking-[0.16em]">Meu trabalho</p></div>
        <h2 className="mt-3 font-heading text-2xl font-extrabold">{nomeValido ? `Olá, ${nome}` : "Suas responsabilidades"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{!vinculado ? "Peça ao administrador para vincular seu login ao cadastro da equipe na área Usuários." : itens.length ? `Você tem ${itens.length} responsabilidade(s) pendente(s) em todo o ERP.` : "Você não tem responsabilidades pendentes no momento."}</p>
        <div className="mt-4 grid max-w-xl grid-cols-2 gap-2">
          <WorkFilterButton active={filtro === "prioritarias"} count={prioritarias} label="Prioridades" icon={Clock3} tone="info" onClick={() => alternarFiltro("prioritarias")} />
          <WorkFilterButton active={filtro === "atrasadas"} count={atrasadas} label="Atrasadas" icon={AlertTriangle} tone={atrasadas ? "danger" : "default"} onClick={() => alternarFiltro("atrasadas")} />
          {mostrarFinanceiro && <WorkFilterButton active={filtro === "proximos_vencimentos"} count={proximosVencimentos.length} label="Próximos vencimentos" icon={CalendarClock} tone="warning" onClick={() => alternarFiltro("proximos_vencimentos")} />}
          {mostrarFinanceiro && <WorkFilterButton active={filtro === "contas_vencidas"} count={contasVencidas.length} label="Contas vencidas" icon={CalendarClock} tone={contasVencidas.length ? "danger" : "default"} onClick={() => alternarFiltro("contas_vencidas")} />}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Clique nos indicadores para filtrar responsabilidades e contas.</p>
      </div>
      <div className="max-h-72 overflow-y-auto rounded-xl border bg-background/55 p-4"><div className="flex items-center justify-between gap-3 border-b border-border/70 pb-2"><p className="text-xs font-semibold">{tituloLista}</p>{filtro !== "todas" && <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => setFiltro("todas")}>Mostrar todas</button>}</div>{itensExibidos.length ? <ul className="divide-y divide-border/70">{itensExibidos.map((item) => <li key={item.id} className="py-3"><Link href={item.href} className="block rounded-md outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.titulo}</p><p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><Badge variant="outline" className="px-1.5 py-0 text-[10px]">{item.origem}</Badge><span>{item.prazo ? formatDate(item.prazo) : "Sem prazo"}</span></p></div>{item.detalhe && <span className="shrink-0 text-xs font-bold text-primary">{item.detalhe}</span>}</div></Link></li>)}</ul> : <p className="py-5 text-center text-sm text-muted-foreground">{filtro === "proximos_vencimentos" ? "Nenhum vencimento próximo." : filtro === "contas_vencidas" ? "Nenhuma conta vencida." : !vinculado ? "Vínculo ainda não configurado." : filtro === "atrasadas" ? "Nenhuma responsabilidade atrasada." : filtro === "prioritarias" ? "Nenhuma prioridade no prazo." : "Tudo certo por aqui."}</p>}</div>
    </CardContent>
  </Card>
}

function WorkFilterButton({ active, count, label, icon: Icon, tone, onClick }: {
  active: boolean
  count: number
  label: string
  icon: React.ComponentType<{ className?: string }>
  tone: "primary" | "info" | "warning" | "danger" | "default"
  onClick: () => void
}) {
  const estilos = {
    primary: active ? "border-primary bg-primary/15 ring-1 ring-primary" : "border-primary/20 bg-primary/5 hover:bg-primary/10",
    info: active ? "border-sky-400 bg-sky-400/15 ring-1 ring-sky-400" : "border-sky-400/25 bg-sky-400/5 hover:bg-sky-400/10",
    warning: active ? "border-amber-400 bg-amber-400/15 ring-1 ring-amber-400" : "border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/10",
    danger: active ? "border-destructive bg-destructive/15 ring-1 ring-destructive" : "border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
    default: active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border/70 bg-background/30 hover:bg-muted/40",
  }
  const icone = tone === "danger" ? "text-destructive" : tone === "warning" ? "text-amber-300" : tone === "info" ? "text-sky-400" : tone === "primary" ? "text-primary" : "text-muted-foreground"
  return <button type="button" aria-pressed={active} onClick={onClick} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors", estilos[tone])}><Icon className={cn("size-4", icone)} /><div><p className="text-lg font-bold leading-none">{count}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p></div></button>
}

type FinanceOption = {
  id: string
  label: string
  value: string
  hint: string
  icon: React.ComponentType<{ className?: string }>
  tone: "primary" | "success" | "warning"
  content: React.ReactNode
}

function FinanceSwitcherCard({ title, options }: { title: string; options: FinanceOption[] }) {
  const [selecionadoId, setSelecionadoId] = useState(options[0]?.id || "")
  const [aberto, setAberto] = useState(false)
  const selecionado = options.find((item) => item.id === selecionadoId) || options[0]
  if (!selecionado) return null
  const Icon = selecionado.icon
  const tones = { primary: "bg-primary/12 text-primary ring-1 ring-primary/15", success: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/15", warning: "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/15" }

  return <Card className="overflow-hidden transition-colors hover:border-primary/25">
    <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <Select value={selecionado.id} onValueChange={(valor) => { if (valor) { setSelecionadoId(valor); setAberto(false) } }}>
        <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <button type="button" className="flex w-full items-start justify-between gap-4 p-5 text-left" onClick={() => setAberto((atual) => !atual)} aria-expanded={aberto}>
      <div className="min-w-0"><p className="text-xs font-semibold text-primary">{selecionado.label}</p><p className="mt-1 font-heading text-2xl font-extrabold tracking-tight">{selecionado.value}</p><p className="mt-1 text-xs text-muted-foreground">{selecionado.hint}</p><p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary">{aberto ? "Ocultar detalhes" : "Ver detalhes"}<ChevronDown className={cn("size-3.5 transition-transform", aberto && "rotate-180")} /></p></div>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tones[selecionado.tone])}><Icon className="size-5" /></span>
    </button>
    {aberto && <div className="max-h-72 overflow-y-auto border-t px-5 pb-4"><div className="pt-2">{selecionado.content}</div></div>}
  </Card>
}

function ExpandableCard({ label, value, hint, icon: Icon, tone = "default", children }: {
  label: string
  value: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: "default" | "primary" | "success" | "warning"
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const tones = { default: "bg-white/5 text-muted-foreground", primary: "bg-primary/12 text-primary ring-1 ring-primary/15", success: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/15", warning: "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/15" }
  return <Card className="overflow-hidden transition-colors hover:border-primary/25">
    <button type="button" className="flex w-full items-start justify-between gap-4 p-5 text-left sm:p-6" onClick={() => setAberto((atual) => !atual)} aria-expanded={aberto}>
      <div className="min-w-0 space-y-2"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="font-heading text-2xl font-extrabold tracking-tight">{value}</p>{hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}<p className="flex items-center gap-1 text-[11px] font-semibold text-primary">{aberto ? "Ocultar detalhes" : "Ver detalhes"}<ChevronDown className={cn("size-3.5 transition-transform", aberto && "rotate-180")} /></p></div>
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}><Icon className="size-5" /></span>
    </button>
    {aberto && <div className="max-h-80 overflow-y-auto border-t px-5 pb-5 sm:px-6"><div className="pt-2">{children}</div></div>}
  </Card>
}

function PaymentSupplierList({ pagamentos, vazio }: { pagamentos: PagamentoFornecedor[]; vazio: string }) {
  if (!pagamentos.length) return <Empty text={vazio} />
  return <ul className="divide-y divide-border/70">{pagamentos.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{p.fornecedor}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(p.vencimento)} · Responsável: {p.responsavel || "Não definido"}</p></div><span className="shrink-0 text-sm font-bold text-primary">{formatBRL(p.valor)}</span></li>)}</ul>
}

function PaymentMotoboyList({ pagamentos, vazio }: { pagamentos: PagamentoMotoboy[]; vazio: string }) {
  if (!pagamentos.length) return <Empty text={vazio} />
  return <ul className="divide-y divide-border/70">{pagamentos.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{p.motoboy_nome || "Motoboy não definido"}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(p.data)} · Responsável: {p.responsavel || "Não definido"}</p></div><span className="shrink-0 text-sm font-bold text-primary">{formatBRL(p.total)}</span></li>)}</ul>
}

function TaskList({ tarefas, vazio, atrasadas }: { tarefas: TarefaKanban[]; vazio: string; atrasadas?: boolean }) {
  if (!tarefas.length) return <Empty text={vazio} />
  return (
    <ul className="divide-y divide-border/70">
      {tarefas.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-4 py-3.5">
          <div className="min-w-0">
            <p className="truncate font-semibold">{t.titulo}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Responsável: <span className="text-foreground/80">{t.responsavel_nome}</span>
            </p>
          </div>
          {t.prazo && (
            <Badge variant={atrasadas ? "destructive" : "secondary"} className="shrink-0">
              {formatDate(t.prazo)}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{text}</p>
}

function TeamCard({ colaboradores, socios, motoboys, escalados, semanaInicio }: {
  colaboradores: Colaborador[]
  socios: Colaborador[]
  motoboys: Motoboy[]
  escalados: Set<string>
  semanaInicio: string
}) {
  const [aberto, setAberto] = useState(false)
  const total = colaboradores.length + socios.length + motoboys.length
  const fimDaSemana = new Date(`${semanaInicio}T12:00:00`)
  fimDaSemana.setDate(fimDaSemana.getDate() + 6)
  const periodo = `${formatDate(semanaInicio)} a ${fimDaSemana.toLocaleDateString("pt-BR")}`
  const nomes = [...socios, ...colaboradores, ...motoboys]
  const lista = (
    <div className="grid gap-1.5 text-xs">
      {!nomes.length ? <p>Nenhuma pessoa ativa cadastrada.</p> : nomes.map((p) => (
        <p key={p.id}>{p.nome}{escalados.has(p.id) ? " · escalado nesta semana" : ""}</p>
      ))}
      {nomes.length > 0 && escalados.size === 0 && <p className="mt-1 text-muted-foreground">Nenhuma escala preenchida para a semana atual.</p>}
    </div>
  )
  return (
    <Card className="overflow-hidden">
      <button type="button" className="flex w-full items-start justify-between p-5 text-left sm:p-6" onClick={() => setAberto((atual) => !atual)} aria-expanded={aberto}>
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Equipe ativa</p>
          <p className="font-heading text-2xl font-extrabold">{total}</p>
          <p className="text-xs text-muted-foreground">{colaboradores.length} colaboradores · {motoboys.length} motoboys · {socios.length} sócios</p>
          <p className="text-[11px] font-medium text-primary">Semana de {periodo}</p>
          <p className="flex items-center gap-1 text-[11px] font-semibold text-primary">{aberto ? "Ocultar detalhes" : "Ver detalhes"}<ChevronDown className={cn("size-3.5 transition-transform", aberto && "rotate-180")} /></p>
        </div>
        <span className="grid size-11 place-items-center rounded-xl bg-white/5"><Users className="size-5" /></span>
      </button>
      {aberto && <div className="border-t px-5 pb-5 sm:px-6"><p className="mb-2 pt-4 font-semibold">Pessoas disponíveis</p>{lista}</div>}
    </Card>
  )
}
