"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Bike,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Factory,
  Landmark,
  Scale,
  Truck,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { carregarPermissoes, type Permissoes } from "@/lib/access-control"
import { getNome } from "@/lib/auth-roles"
import { formatBRL, formatDate, mondayOf, todayISO } from "@/lib/format"
import { useTable } from "@/lib/use-data"
import type { Configuracao } from "@/lib/types"
import { DashboardGoals } from "@/components/dashboard-goals"
import { DashboardWeeklyAgenda } from "@/components/dashboard-weekly-agenda"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type ResumoDashboard = {
  producao_planejada: number
  producao_em_andamento: number
  reunioes_semana: number
  pessoas_na_escala: number
  fornecedores_pendentes: number
  fornecedores_valor: number
  motoboys_pendentes: number
  motoboys_valor: number
  demandas_juridicas: number
  contratos_pendentes: number
}

type ItemTrabalho = {
  id: string
  titulo: string
  origem: string
  href: string
  prazo: string | null
  status: string
  detalhe: string | null
  pode_abrir: boolean
}

const RESUMO_VAZIO: ResumoDashboard = {
  producao_planejada: 0,
  producao_em_andamento: 0,
  reunioes_semana: 0,
  pessoas_na_escala: 0,
  fornecedores_pendentes: 0,
  fornecedores_valor: 0,
  motoboys_pendentes: 0,
  motoboys_valor: 0,
  demandas_juridicas: 0,
  contratos_pendentes: 0,
}

export function Dashboard() {
  const supabase = createClient()
  const { data: configuracoes } = useTable<Configuracao>("configuracoes")
  const [nome, setNome] = useState("")
  const [permissoes, setPermissoes] = useState<Permissoes | null>(null)
  const [resumo, setResumo] = useState<ResumoDashboard>(RESUMO_VAZIO)
  const [meuTrabalho, setMeuTrabalho] = useState<ItemTrabalho[]>([])
  const [loading, setLoading] = useState(true)
  const semanaInicio = mondayOf(todayISO())

  useEffect(() => {
    let ativo = true

    async function carregar() {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user || !ativo) return
      setNome(getNome(auth.user))

      const [acessos, resumoResult, trabalhoResult] = await Promise.all([
        carregarPermissoes(auth.user),
        supabase.rpc("resumo_dashboard_v1", { semana_inicio_param: semanaInicio }),
        supabase.rpc("listar_meu_trabalho_dashboard"),
      ])
      if (!ativo) return
      setPermissoes(acessos)
      setResumo(((resumoResult.data ?? [])[0] as ResumoDashboard | undefined) ?? RESUMO_VAZIO)
      setMeuTrabalho((trabalhoResult.data ?? []) as ItemTrabalho[])
      setLoading(false)
    }

    void carregar()
    return () => {
      ativo = false
    }
  }, [semanaInicio, supabase])

  const mostrarAgenda = Boolean(permissoes?.dashboard_calendario_producao)
  const mostrarFornecedores = Boolean(permissoes?.dashboard_fornecedores)
  const mostrarMotoboys = Boolean(permissoes?.dashboard_motoboys)
  const podeAbrirFornecedores = Boolean(permissoes?.pagamentos_fornecedores)
  const podeAbrirMotoboys = Boolean(permissoes?.pagamentos_motoboys)
  const mostrarFinanceiro = mostrarFornecedores || mostrarMotoboys
  const mostrarProducao = Boolean(
    permissoes?.producao_planejamento || permissoes?.producao_estoque || permissoes?.producao_compras,
  )
  const mostrarJuridico = Boolean(permissoes?.juridico)
  const valorFinanceiro =
    (mostrarFornecedores ? Number(resumo.fornecedores_valor) : 0) +
    (mostrarMotoboys ? Number(resumo.motoboys_valor) : 0)
  const totalFinanceiro =
    (mostrarFornecedores ? Number(resumo.fornecedores_pendentes) : 0) +
    (mostrarMotoboys ? Number(resumo.motoboys_pendentes) : 0)
  const hrefFinanceiro =
    mostrarFornecedores && podeAbrirFornecedores
      ? "/pagamentos-fornecedores"
      : mostrarMotoboys && podeAbrirMotoboys
        ? "/pagamentos-motoboys"
        : undefined
  const atrasados = useMemo(
    () => meuTrabalho.filter((item) => item.prazo && item.prazo < todayISO()).length,
    [meuTrabalho],
  )

  return (
    <div>
      <PageHeader
        title={configuracoes.find((item) => item.chave === "dashboard_titulo")?.valor || "Painel Geral"}
        description={
          configuracoes.find((item) => item.chave === "dashboard_descricao")?.valor ||
          "Visão consolidada das suas responsabilidades e das áreas liberadas para seu acesso."
        }
      />

      <DashboardGoals />

      <section aria-label="Visão por nível de acesso" className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <OverviewCard
          icon={ClipboardList}
          title="Meu trabalho"
          value={loading ? "—" : `${meuTrabalho.length} item(ns)`}
          detail={atrasados ? `${atrasados} atrasado(s)` : `Responsabilidades de ${nome || "você"}`}
          tone={atrasados ? "warning" : "default"}
        />
        {mostrarAgenda && (
          <OverviewCard
            icon={CalendarDays}
            title="Agenda da semana"
            value={`${Number(resumo.reunioes_semana)} reunião(ões)`}
            detail={`${Number(resumo.pessoas_na_escala)} pessoa(s) com escala`}
          />
        )}
        {mostrarFinanceiro && (
          <OverviewCard
            icon={Landmark}
            title="Resumo financeiro"
            value={formatBRL(valorFinanceiro)}
            detail={`${totalFinanceiro} pagamento(s) pendente(s)`}
            href={hrefFinanceiro}
          />
        )}
        {mostrarProducao && (
          <OverviewCard
            icon={Factory}
            title="Produção"
            value={`${Number(resumo.producao_planejada)} planejado(s)`}
            detail={`${Number(resumo.producao_em_andamento)} em produção nesta semana`}
            href="/producao"
          />
        )}
        {mostrarJuridico && (
          <OverviewCard
            icon={Scale}
            title="Jurídico"
            value={`${Number(resumo.demandas_juridicas)} demanda(s)`}
            detail={`${Number(resumo.contratos_pendentes)} contrato(s) pendente(s)`}
            href="/juridico"
          />
        )}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        <MyWorkCard itens={meuTrabalho} loading={loading} />
        {mostrarAgenda ? (
          <DashboardWeeklyAgenda semanaInicio={semanaInicio} />
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-lg">Agenda da semana</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">A agenda não está habilitada para este acesso.</p></CardContent>
          </Card>
        )}
      </section>

      {mostrarFinanceiro && (
        <section aria-label="Resumo financeiro" className="mt-4 grid gap-4 md:grid-cols-2">
          {mostrarFornecedores && (
            <FinancialCard
              icon={Truck}
              title="Fornecedores"
              value={Number(resumo.fornecedores_valor)}
              count={Number(resumo.fornecedores_pendentes)}
              href={podeAbrirFornecedores ? "/pagamentos-fornecedores" : undefined}
            />
          )}
          {mostrarMotoboys && (
            <FinancialCard
              icon={Bike}
              title="Motoboys"
              value={Number(resumo.motoboys_valor)}
              count={Number(resumo.motoboys_pendentes)}
              href={podeAbrirMotoboys ? "/pagamentos-motoboys" : undefined}
            />
          )}
        </section>
      )}
    </div>
  )
}

function OverviewCard({
  icon: Icon,
  title,
  value,
  detail,
  href,
  tone = "default",
}: {
  icon: typeof ClipboardList
  title: string
  value: string
  detail: string
  href?: string
  tone?: "default" | "warning"
}) {
  const content = (
    <Card className={`h-full transition-colors ${href ? "hover:border-primary/50" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">{title}</CardTitle>
          <Icon className={`size-5 ${tone === "warning" ? "text-amber-500" : "text-primary"}`} />
        </div>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-bold">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function MyWorkCard({ itens, loading }: { itens: ItemTrabalho[]; loading: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="size-5 text-primary" />Meu trabalho</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Itens atribuídos diretamente a você, mesmo quando a área de gestão está restrita.</p>
          </div>
          <Badge variant="secondary">{itens.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid max-h-[560px] gap-2 overflow-y-auto p-4">
        {loading ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Carregando responsabilidades...</p>
        ) : itens.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <CheckCircle2 className="mx-auto size-7 text-primary" />
            <p className="mt-2 font-semibold">Nenhuma pendência atribuída</p>
            <p className="mt-1 text-xs text-muted-foreground">As próximas responsabilidades aparecerão aqui.</p>
          </div>
        ) : itens.map((item) => {
          const atrasado = Boolean(item.prazo && item.prazo < todayISO())
          const card = (
            <article className={`rounded-xl border p-3 ${item.pode_abrir ? "hover:border-primary/50 hover:bg-primary/5" : "bg-muted/15"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{item.titulo}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.origem}</p>
                </div>
                <Badge variant={atrasado ? "destructive" : "outline"}>{item.status.replaceAll("_", " ")}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {item.prazo && <span className={atrasado ? "flex items-center gap-1 text-destructive" : ""}>{atrasado && <AlertTriangle className="size-3" />}Prazo: {formatDate(item.prazo)}</span>}
                {item.detalhe && <span>{item.detalhe}</span>}
                {!item.pode_abrir && <span>Consulta disponível somente nesta Dashboard</span>}
              </div>
            </article>
          )
          return item.pode_abrir ? <Link key={item.id} href={item.href}>{card}</Link> : <div key={item.id}>{card}</div>
        })}
      </CardContent>
    </Card>
  )
}

function FinancialCard({
  icon: Icon,
  title,
  value,
  count,
  href,
}: {
  icon: typeof Truck
  title: string
  value: number
  count: number
  href?: string
}) {
  const content = (
    <Card className={`transition-colors ${href ? "hover:border-primary/50" : ""}`}>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 font-heading text-2xl font-bold">{formatBRL(value)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{count} pagamento(s) pendente(s)</p>
          {!href && <p className="mt-1 text-xs text-muted-foreground">Resumo somente para consulta.</p>}
        </div>
        <Icon className="size-7 text-primary" />
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}
