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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { getNome } from "@/lib/auth-roles"
import { cn } from "@/lib/utils"

type UsuarioVinculo = { usuario_id: string; colaborador_id: string }
type ReuniaoItem = { id: string; descricao: string; responsavel_id: string | null; responsavel_nome: string | null; prazo: string | null; status: string }
type DemandaJuridica = { id: string; titulo: string; responsavel_id: string | null; responsavel_nome: string | null; prazo: string | null; status: string }
type Contrato = { id: string; titulo: string; responsavel_id: string | null; responsavel_nome: string | null; vencimento: string | null; status: string }
type ItemTrabalho = { id: string; titulo: string; origem: string; href: string; prazo: string | null; detalhe?: string }

export function Dashboard() {
  const supabase = createClient()
  const [usuarioNome, setUsuarioNome] = useState("")
  const [usuarioId, setUsuarioId] = useState("")
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
  const tarefasAtrasadas = tarefasPendentes.filter((t) => t.prazo && t.prazo < hoje).slice(0, 6)
  const tarefasPrioritarias = tarefasPendentes
    .filter((t) => t.prazo && t.prazo >= hoje)
    .sort((a, b) => (a.prazo ?? "").localeCompare(b.prazo ?? ""))
    .slice(0, 6)
  const normalizarNome = (nome: string) => nome.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
  const colaboradorVinculadoId = vinculos.find((vinculo) => vinculo.usuario_id === usuarioId)?.colaborador_id ?? null
  const colaboradorVinculado = colaboradores.find((pessoa) => pessoa.id === colaboradorVinculadoId) ?? null
  const nomesDoUsuario = [usuarioNome, colaboradorVinculado?.nome].filter((nome): nome is string => Boolean(nome && !nome.includes("@"))).map(normalizarNome)
  const pertenceAoUsuario = (responsavelId: string | null | undefined, responsavelNome: string | null | undefined) =>
    Boolean((colaboradorVinculadoId && responsavelId === colaboradorVinculadoId) || (responsavelNome && nomesDoUsuario.includes(normalizarNome(responsavelNome))))
  const meuTrabalho: ItemTrabalho[] = [
    ...tarefasPendentes.filter((item) => pertenceAoUsuario(item.responsavel_id, item.responsavel_nome)).map((item) => ({ id: `kanban-${item.id}`, titulo: item.titulo, origem: "Kanban", href: "/kanban", prazo: item.prazo })),
    ...pendentesForn.filter((item) => pertenceAoUsuario(null, item.responsavel)).map((item) => ({ id: `fornecedor-${item.id}`, titulo: `Pagamento: ${item.fornecedor}`, origem: "Fornecedores", href: "/pagamentos-fornecedores", prazo: item.vencimento, detalhe: formatBRL(item.valor) })),
    ...pendentesMoto.filter((item) => pertenceAoUsuario(null, item.responsavel)).map((item) => ({ id: `motoboy-${item.id}`, titulo: `Pagamento: ${item.motoboy_nome || "Motoboy"}`, origem: "Motoboys", href: "/pagamentos-motoboys", prazo: item.data, detalhe: formatBRL(item.total) })),
    ...itensReuniao.filter((item) => item.status !== "concluido" && pertenceAoUsuario(item.responsavel_id, item.responsavel_nome)).map((item) => ({ id: `reuniao-${item.id}`, titulo: item.descricao, origem: "Reuniões", href: "/reunioes", prazo: item.prazo })),
    ...demandasJuridicas.filter((item) => item.status !== "concluido" && pertenceAoUsuario(item.responsavel_id, item.responsavel_nome)).map((item) => ({ id: `juridico-${item.id}`, titulo: item.titulo, origem: "Jurídico", href: "/juridico", prazo: item.prazo })),
    ...contratos.filter((item) => !["assinado", "arquivado"].includes(item.status) && pertenceAoUsuario(item.responsavel_id, item.responsavel_nome)).map((item) => ({ id: `contrato-${item.id}`, titulo: item.titulo, origem: "Contratos", href: "/juridico", prazo: item.vencimento })),
  ].sort((a, b) => (a.prazo ?? "9999-12-31").localeCompare(b.prazo ?? "9999-12-31"))

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

  return (
    <div>
      <PageHeader
        title={configuracoes.find((c) => c.chave === "dashboard_titulo")?.valor || "Dashboard"}
        description={
          configuracoes.find((c) => c.chave === "dashboard_descricao")?.valor ||
          "Acompanhe pagamentos, equipe e prioridades da operação."
        }
      />

      <PersonalTasksCard nome={colaboradorVinculado?.nome || usuarioNome} itens={meuTrabalho} vinculado={Boolean(colaboradorVinculadoId)} />

      <section aria-label="Resumo financeiro e operacional" className="mt-4 grid gap-4 md:grid-cols-2">
        <ExpandableCard
          label="A pagar — Fornecedores"
          value={formatBRL(pendentesForn.reduce((s, p) => s + (p.valor ?? 0), 0))}
          hint={`${pendentesForn.length} conta(s) em aberto`}
          icon={Truck}
          tone="primary"
        ><PaymentSupplierList pagamentos={pendentesForn} vazio="Nenhuma conta de fornecedor pendente." /></ExpandableCard>
        <ExpandableCard
          label="A pagar — Motoboys"
          value={formatBRL(pendentesMoto.reduce((s, p) => s + (p.total ?? 0), 0))}
          hint={`${pendentesMoto.length} pagamento(s) pendente(s)`}
          icon={Bike}
          tone="warning"
        ><PaymentMotoboyList pagamentos={pendentesMoto} vazio="Nenhum pagamento de motoboy pendente." /></ExpandableCard>
        <ExpandableCard
          label="Pago no mês — Fornecedores"
          value={formatBRL(pagosFornMes.reduce((s, p) => s + (p.valor ?? 0), 0))}
          hint="Pagamentos de fornecedores"
          icon={CheckCircle2}
          tone="success"
        ><PaymentSupplierList pagamentos={pagosFornMes} vazio="Nenhum fornecedor pago neste mês." /></ExpandableCard>
        <ExpandableCard
          label="Pago no mês — Motoboys"
          value={formatBRL(pagosMotoMes.reduce((s, p) => s + (p.total ?? 0), 0))}
          hint="Pagamentos de motoboys"
          icon={Wallet}
          tone="success"
        ><PaymentMotoboyList pagamentos={pagosMotoMes} vazio="Nenhum motoboy pago neste mês." /></ExpandableCard>
        <TeamCard colaboradores={colaboradoresAtivos} socios={sociosAtivos} motoboys={motoboysAtivos} escalados={idsEscalados} />
        <ExpandableCard
          label="Pendências — Sócios"
          value={`${socios.total} tarefa(s)`}
          hint={socios.pessoas.length ? socios.pessoas.join(" · ") : "Nenhum sócio com tarefa pendente"}
          icon={CircleDot}
          tone="primary"
        ><TaskList tarefas={tarefasPendentes.filter((t) => t.contexto === "socios")} vazio="Nenhuma pendência de sócio." /></ExpandableCard>
        <ExpandableCard
          label="Pendências — Colaboradores"
          value={`${equipe.total} tarefa(s)`}
          hint={equipe.pessoas.length ? equipe.pessoas.join(" · ") : "Nenhum colaborador com tarefa pendente"}
          icon={CircleDot}
          tone="warning"
        ><TaskList tarefas={tarefasPendentes.filter((t) => t.contexto === "colaboradores")} vazio="Nenhuma pendência de colaborador." /></ExpandableCard>
        <ExpandableCard
          label="Contas vencidas"
          value={`${vencidos.length}`}
          hint={vencidos.length ? formatBRL(vencidos.reduce((s, p) => s + (p.valor ?? 0), 0)) : "Operação em dia"}
          icon={AlertTriangle}
          tone={vencidos.length ? "warning" : "success"}
        ><PaymentSupplierList pagamentos={vencidos} vazio="Nenhuma conta vencida." /></ExpandableCard>
      </section>

      <section aria-label="Detalhes do dashboard" className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Próximos vencimentos" icon={CalendarClock} href="/pagamentos-fornecedores">
          {pendentesForn.length === 0 ? <Empty text="Nenhuma conta em aberto." /> : (
            <ul className="divide-y divide-border/70">
              {pendentesForn.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.fornecedor}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(p.vencimento)} · Responsável: <span className="text-foreground/80">{p.responsavel || "Não definido"}</span>
                    </p>
                  </div>
                  <span className="shrink-0 font-heading font-bold text-primary">{formatBRL(p.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Últimos pagamentos de motoboys" icon={Wallet} href="/pagamentos-motoboys">
          {motoboyPagtos.length === 0 ? <Empty text="Nenhum pagamento registrado." /> : (
            <ul className="divide-y divide-border/70">
              {motoboyPagtos.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.motoboy_nome ?? "Motoboy não definido"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(p.data)} · Responsável: <span className="text-foreground/80">{p.responsavel || "Não definido"}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-heading font-bold text-primary">{formatBRL(p.total)}</p>
                    <Badge variant={p.pago_em ? "default" : "secondary"} className="mt-1">
                      {p.pago_em ? "Pago" : "Pendente"}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Tarefas prioritárias" icon={Clock3} href="/kanban">
          <TaskList tarefas={tarefasPrioritarias} vazio="Nenhuma tarefa prioritária." />
        </Panel>

        <Panel title="Tarefas atrasadas" icon={AlertTriangle} href="/kanban" danger>
          <TaskList tarefas={tarefasAtrasadas} vazio="Nenhuma tarefa atrasada." atrasadas />
        </Panel>
      </section>
    </div>
  )
}

function PersonalTasksCard({ nome, itens, vinculado }: { nome: string; itens: ItemTrabalho[]; vinculado: boolean }) {
  const nomeValido = nome && !nome.includes("@")
  return <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card">
    <CardContent className="grid gap-5 py-6 md:grid-cols-[minmax(0,1fr)_minmax(280px,.9fr)] md:items-center">
      <div><div className="flex items-center gap-2 text-primary"><UserRound className="size-5" /><p className="text-xs font-bold uppercase tracking-[0.16em]">Meu trabalho</p></div><h2 className="mt-3 font-heading text-2xl font-extrabold">{nomeValido ? `Olá, ${nome}` : "Suas responsabilidades"}</h2><p className="mt-2 text-sm text-muted-foreground">{!vinculado ? "Peça ao administrador para vincular seu login ao cadastro da equipe na área Usuários." : itens.length ? `Você tem ${itens.length} responsabilidade(s) pendente(s) em todo o ERP.` : "Você não tem responsabilidades pendentes no momento."}</p></div>
      <div className="max-h-72 overflow-y-auto rounded-xl border bg-background/55 p-4">{itens.length ? <ul className="divide-y divide-border/70">{itens.map((item) => <li key={item.id} className="py-3"><Link href={item.href} className="block rounded-md outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.titulo}</p><p className="mt-1 text-xs text-muted-foreground">{item.origem}{item.prazo ? ` · ${formatDate(item.prazo)}` : " · Sem prazo"}</p></div>{item.detalhe && <span className="shrink-0 text-xs font-bold text-primary">{item.detalhe}</span>}</div></Link></li>)}</ul> : <p className="py-4 text-center text-sm text-muted-foreground">{vinculado ? "Tudo certo por aqui." : "Vínculo ainda não configurado."}</p>}</div>
    </CardContent>
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

function Panel({
  title,
  icon: Icon,
  href,
  danger,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <Card className={danger ? "border-destructive/25" : ""}>
      <CardHeader className="flex-row items-center justify-between border-b border-border/60 pb-4">
        <CardTitle className="flex items-center gap-2.5 font-heading font-bold">
          <span className={`grid size-8 place-items-center rounded-lg ${danger ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
            <Icon className="size-4" />
          </span>
          {title}
        </CardTitle>
        <Button asChild variant="ghost" size="sm"><Link href={href}>Ver tudo</Link></Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
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

function TeamCard({ colaboradores, socios, motoboys, escalados }: {
  colaboradores: Colaborador[]
  socios: Colaborador[]
  motoboys: Motoboy[]
  escalados: Set<string>
}) {
  const [aberto, setAberto] = useState(false)
  const total = colaboradores.length + socios.length + motoboys.length
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
        </div>
        <span className="grid size-11 place-items-center rounded-xl bg-white/5"><Users className="size-5" /></span>
      </button>
      {aberto && <div className="border-t px-5 pb-5 sm:px-6"><p className="mb-2 pt-4 font-semibold">Pessoas disponíveis</p>{lista}</div>}
    </Card>
  )
}
