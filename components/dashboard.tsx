"use client"

import type React from "react"
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
} from "lucide-react"
import { useTable } from "@/lib/use-data"
import { isSocio, type Colaborador, type Configuracao, type Escala, type Motoboy, type PagamentoFornecedor, type PagamentoMotoboy } from "@/lib/types"
import type { TarefaKanban } from "@/lib/kanban-data"
import { formatBRL, formatDate, mondayOf, todayISO } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export function Dashboard() {
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

  const hoje = todayISO()
  const mesAtual = hoje.slice(0, 7)
  const pendentesForn = fornecedores.filter((p) => !p.pago_em)
  const pendentesMoto = motoboyPagtos.filter((p) => !p.pago_em)
  const vencidos = pendentesForn.filter((p) => p.vencimento < hoje)
  const tarefasPendentes = tarefas.filter((t) => t.status !== "concluido")
  const tarefasAtrasadas = tarefasPendentes.filter((t) => t.prazo && t.prazo < hoje).slice(0, 6)
  const tarefasPrioritarias = tarefasPendentes
    .filter((t) => t.prazo && t.prazo >= hoje)
    .sort((a, b) => (a.prazo ?? "").localeCompare(b.prazo ?? ""))
    .slice(0, 6)

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

      <section aria-label="Resumo financeiro e operacional" className="grid gap-4 md:grid-cols-2">
        <StatCard
          label="A pagar — Fornecedores"
          value={formatBRL(pendentesForn.reduce((s, p) => s + (p.valor ?? 0), 0))}
          hint={`${pendentesForn.length} conta(s) em aberto`}
          icon={Truck}
          tone="primary"
        />
        <StatCard
          label="A pagar — Motoboys"
          value={formatBRL(pendentesMoto.reduce((s, p) => s + (p.total ?? 0), 0))}
          hint={`${pendentesMoto.length} pagamento(s) pendente(s)`}
          icon={Bike}
          tone="warning"
        />
        <StatCard
          label="Pago no mês — Fornecedores"
          value={formatBRL(
            fornecedores
              .filter((p) => p.pago_em?.slice(0, 7) === mesAtual)
              .reduce((s, p) => s + (p.valor ?? 0), 0),
          )}
          hint="Pagamentos de fornecedores"
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Pago no mês — Motoboys"
          value={formatBRL(
            motoboyPagtos
              .filter((p) => p.pago_em?.slice(0, 7) === mesAtual)
              .reduce((s, p) => s + (p.total ?? 0), 0),
          )}
          hint="Pagamentos de motoboys"
          icon={Wallet}
          tone="success"
        />
        <TeamCard colaboradores={colaboradoresAtivos} socios={sociosAtivos} motoboys={motoboysAtivos} escalados={idsEscalados} />
        <StatCard
          label="Pendências — Sócios"
          value={`${socios.total} tarefa(s)`}
          hint={socios.pessoas.length ? socios.pessoas.join(" · ") : "Nenhum sócio com tarefa pendente"}
          icon={CircleDot}
          tone="primary"
        />
        <StatCard
          label="Pendências — Colaboradores"
          value={`${equipe.total} tarefa(s)`}
          hint={equipe.pessoas.length ? equipe.pessoas.join(" · ") : "Nenhum colaborador com tarefa pendente"}
          icon={CircleDot}
          tone="warning"
        />
        <StatCard
          label="Contas vencidas"
          value={`${vencidos.length}`}
          hint={vencidos.length ? formatBRL(vencidos.reduce((s, p) => s + (p.valor ?? 0), 0)) : "Operação em dia"}
          icon={AlertTriangle}
          tone={vencidos.length ? "warning" : "success"}
        />
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
    <Card className="group relative p-5 sm:p-6" tabIndex={0}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Equipe ativa</p>
          <p className="font-heading text-2xl font-extrabold">{total}</p>
          <p className="text-xs text-muted-foreground">{colaboradores.length} colaboradores · {motoboys.length} motoboys · {socios.length} sócios</p>
        </div>
        <span className="grid size-11 place-items-center rounded-xl bg-white/5"><Users className="size-5" /></span>
      </div>
      <div className="absolute inset-x-4 top-[calc(100%-8px)] z-20 hidden rounded-xl border border-border bg-popover p-4 shadow-2xl group-hover:block group-focus:block lg:block lg:invisible lg:opacity-0 lg:transition lg:group-hover:visible lg:group-hover:opacity-100 lg:group-focus:visible lg:group-focus:opacity-100">
        <p className="mb-2 font-semibold">Pessoas disponíveis</p>{lista}
      </div>
      <details className="mt-3 lg:hidden">
        <summary className="cursor-pointer text-xs font-semibold text-primary">Ver pessoas</summary>
        <div className="mt-3 rounded-lg bg-muted/40 p-3">{lista}</div>
      </details>
    </Card>
  )
}
