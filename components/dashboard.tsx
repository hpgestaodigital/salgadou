"use client"

import Link from "next/link"
import { AlertTriangle, Bike, CheckCircle2, Clock, Truck, Users, Wallet } from "lucide-react"
import { useTable } from "@/lib/use-data"
import type { Colaborador, Motoboy, PagamentoFornecedor, PagamentoMotoboy } from "@/lib/types"
import { formatBRL, formatDate, todayISO } from "@/lib/format"
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

  const hoje = todayISO()
  const mesAtual = hoje.slice(0, 7)

  const pendentesForn = fornecedores.filter((p) => !p.pago_em)
  const totalPendenteForn = pendentesForn.reduce((s, p) => s + (p.valor ?? 0), 0)
  const vencidos = pendentesForn.filter((p) => p.vencimento < hoje)

  const pendentesMoto = motoboyPagtos.filter((p) => !p.pago_em)
  const totalPendenteMoto = pendentesMoto.reduce((s, p) => s + (p.total ?? 0), 0)

  const pagoNoMes =
    fornecedores
      .filter((p) => p.pago_em && p.pago_em.slice(0, 7) === mesAtual)
      .reduce((s, p) => s + (p.valor ?? 0), 0) +
    motoboyPagtos.filter((p) => p.pago_em && p.pago_em.slice(0, 7) === mesAtual).reduce((s, p) => s + (p.total ?? 0), 0)

  const colaboradoresAtivos = colaboradores.filter((c) => c.ativo).length
  const motoboysAtivos = motoboys.filter((m) => m.ativo).length

  const proximosVencimentos = pendentesForn.slice(0, 6)

  return (
    <div>
      <PageHeader
        title="Painel Geral"
        description="Visão consolidada das finanças e operação da Salgadou."
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="A pagar — Fornecedores"
          value={formatBRL(totalPendenteForn)}
          hint={`${pendentesForn.length} conta(s) em aberto`}
          icon={Truck}
          tone="primary"
        />
        <StatCard
          label="A pagar — Motoboys"
          value={formatBRL(totalPendenteMoto)}
          hint={`${pendentesMoto.length} pagamento(s) pendente(s)`}
          icon={Bike}
          tone="warning"
        />
        <StatCard
          label="Pago no mês"
          value={formatBRL(pagoNoMes)}
          hint="Fornecedores + motoboys"
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Equipe ativa"
          value={`${colaboradoresAtivos + motoboysAtivos}`}
          hint={`${colaboradoresAtivos} colaboradores · ${motoboysAtivos} motoboys`}
          icon={Users}
        />
      </div>

      {vencidos.length > 0 && (
        <Card className="mt-6 border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-destructive/15 text-destructive">
                <AlertTriangle className="size-5" />
              </span>
              <div>
                <p className="font-heading font-bold">
                  {vencidos.length} conta(s) vencida(s)
                </p>
                <p className="text-sm text-muted-foreground">
                  Total de {formatBRL(vencidos.reduce((s, p) => s + (p.valor ?? 0), 0))} em atraso.
                </p>
              </div>
            </div>
            <Button asChild variant="destructive" size="sm">
              <Link href="/pagamentos-fornecedores">Ver contas</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-heading">
              <Clock className="size-5 text-primary" />
              Próximos vencimentos
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/pagamentos-fornecedores">Ver tudo</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {proximosVencimentos.length === 0 ? (
              <EmptyLine text="Nenhuma conta em aberto." />
            ) : (
              <ul className="divide-y divide-border">
                {proximosVencimentos.map((p) => {
                  const atrasado = p.vencimento < hoje
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{p.fornecedor}</p>
                        <p className="text-xs text-muted-foreground">
                          Vence {formatDate(p.vencimento)}
                          {p.pedido ? ` · Pedido ${p.pedido}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-heading font-bold">{formatBRL(p.valor)}</span>
                        {atrasado && <Badge variant="destructive">Vencido</Badge>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-heading">
              <Wallet className="size-5 text-primary" />
              Últimos pagamentos de motoboys
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/pagamentos-motoboys">Ver tudo</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {motoboyPagtos.length === 0 ? (
              <EmptyLine text="Nenhum pagamento registrado." />
            ) : (
              <ul className="divide-y divide-border">
                {motoboyPagtos.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{p.motoboy_nome ?? "Motoboy"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.data)} · {p.numero_entregas ?? 0} entregas
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-heading font-bold">{formatBRL(p.total)}</span>
                      {p.pago_em ? (
                        <Badge className="bg-accent text-accent-foreground">Pago</Badge>
                      ) : (
                        <Badge variant="secondary">Pendente</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>
}
