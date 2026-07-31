import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Receipt,
  Bike,
  CheckCircle2,
  Users,
  ListTodo,
  UserCheck,
  AlertTriangle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  money,
  formatDate,
  todayISO,
  supplierPaymentStatus,
  statusTone,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | Salgadou Gestão" },
      {
        name: "description",
        content: "Visão geral de pagamentos, equipe e tarefas da Salgadou.",
      },
      { property: "og:title", content: "Dashboard | Salgadou Gestão" },
      {
        property: "og:description",
        content: "Visão geral de pagamentos, equipe e tarefas da Salgadou.",
      },
    ],
  }),
  component: Dashboard,
});

function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [sp, cp, emp, tasks] = await Promise.all([
        supabase
          .from("supplier_payments")
          .select("*, suppliers(name)")
          .is("deleted_at", null),
        supabase
          .from("courier_payments")
          .select("*, couriers(name)")
          .is("deleted_at", null),
        supabase.from("employees").select("*").eq("active", true),
        supabase.from("tasks").select("*").is("deleted_at", null),
      ]);
      if (sp.error) throw sp.error;
      if (cp.error) throw cp.error;
      if (emp.error) throw emp.error;
      if (tasks.error) throw tasks.error;
      return {
        supplierPayments: sp.data,
        courierPayments: cp.data,
        employees: emp.data,
        tasks: tasks.data,
      };
    },
  });
}

function Card({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "default" | "primary" | "danger";
}) {
  return (
    <div className="surface-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span
          className={
            tone === "primary"
              ? "rounded-lg bg-primary/15 p-2 text-primary"
              : tone === "danger"
                ? "rounded-lg bg-destructive/15 p-2 text-destructive"
                : "rounded-lg bg-secondary p-2 text-muted-foreground"
          }
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Dashboard() {
  const { data, isLoading } = useDashboardData();
  const today = todayISO();
  const monthPrefix = today.slice(0, 7);

  const sp = data?.supplierPayments ?? [];
  const cp = data?.courierPayments ?? [];
  const tasks = data?.tasks ?? [];

  const toPaySuppliers = sp
    .filter((p) => p.status === "pendente")
    .reduce((acc, p) => acc + Number(p.amount), 0);
  const toPayCouriers = cp
    .filter((p) => p.status === "pendente")
    .reduce((acc, p) => acc + Number(p.fees_amount) + Number(p.daily_amount), 0);
  const paidMonth =
    sp
      .filter((p) => p.status === "pago" && (p.paid_at ?? "").startsWith(monthPrefix))
      .reduce((acc, p) => acc + Number(p.amount), 0) +
    cp
      .filter((p) => p.status === "pago" && (p.paid_at ?? "").startsWith(monthPrefix))
      .reduce((acc, p) => acc + Number(p.fees_amount) + Number(p.daily_amount), 0);

  const partnerTasks = tasks.filter(
    (t) => t.board === "socios" && t.status !== "Concluído",
  );
  const employeeTasks = tasks.filter(
    (t) =>
      t.board === "colaboradores" &&
      t.status !== "Concluído" &&
      t.status !== "Não realizado",
  );
  const overdueTasks = tasks.filter(
    (t) =>
      t.due_date &&
      t.due_date < today &&
      t.status !== "Concluído" &&
      t.status !== "Não realizado",
  );
  const priorityTasks = tasks
    .filter(
      (t) =>
        (t.priority === "urgente" || t.priority === "alta") &&
        t.status !== "Concluído" &&
        t.status !== "Não realizado",
    )
    .slice(0, 6);

  const upcoming = sp
    .filter((p) => p.status === "pendente")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 6);
  const lastCourierPayments = [...cp]
    .sort((a, b) => (b.paid_at ?? b.work_date).localeCompare(a.paid_at ?? a.work_date))
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={isLoading ? "Carregando dados..." : "Panorama operacional da Salgadou"}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card
          label="A pagar — fornecedores"
          value={money(toPaySuppliers)}
          hint={`${sp.filter((p) => p.status === "pendente").length} lançamentos em aberto`}
          icon={Receipt}
          tone="primary"
        />
        <Card
          label="A pagar — motoboys"
          value={money(toPayCouriers)}
          hint={`${cp.filter((p) => p.status === "pendente").length} fechamentos em aberto`}
          icon={Bike}
          tone="primary"
        />
        <Card
          label="Pago no mês"
          value={money(paidMonth)}
          hint="Fornecedores + motoboys"
          icon={CheckCircle2}
        />
        <Card
          label="Equipe ativa"
          value={String(data?.employees.length ?? 0)}
          hint="Colaboradores e sócios ativos"
          icon={Users}
        />
        <Card
          label="Tarefas pendentes — sócios"
          value={String(partnerTasks.length)}
          icon={ListTodo}
        />
        <Card
          label="Tarefas pendentes — colaboradores"
          value={String(employeeTasks.length)}
          icon={UserCheck}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="surface-panel p-4">
          <h2 className="mb-3 font-display text-sm font-semibold">
            Próximos vencimentos
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada a vencer no momento.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((p) => {
                const s = supplierPaymentStatus(p);
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {p.suppliers?.name ?? "Fornecedor"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.description || "—"} · vence {formatDate(p.due_date)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className={statusTone(s)}>
                        {s}
                      </Badge>
                      <span className="text-sm font-semibold">{money(p.amount)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            to="/fornecedores"
            className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
          >
            Ver todos os pagamentos
          </Link>
        </section>

        <section className="surface-panel p-4">
          <h2 className="mb-3 font-display text-sm font-semibold">
            Últimos pagamentos de motoboys
          </h2>
          {lastCourierPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum fechamento registrado ainda.
            </p>
          ) : (
            <ul className="space-y-2">
              {lastCourierPayments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {p.couriers?.name ?? "Motoboy"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.work_date)} · {p.deliveries} entregas
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={statusTone(p.status === "pago" ? "Pago" : "Pendente")}
                    >
                      {p.status === "pago" ? "Pago" : "Pendente"}
                    </Badge>
                    <span className="text-sm font-semibold">
                      {money(Number(p.fees_amount) + Number(p.daily_amount))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/motoboys"
            className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
          >
            Ver todos os fechamentos
          </Link>
        </section>

        <section className="surface-panel p-4">
          <h2 className="mb-3 font-display text-sm font-semibold">Tarefas prioritárias</h2>
          {priorityTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa prioritária.</p>
          ) : (
            <ul className="space-y-2">
              {priorityTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.status} · prazo {formatDate(t.due_date)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      t.priority === "urgente"
                        ? "border-destructive/30 bg-destructive/15 text-destructive"
                        : "border-warning/30 bg-warning/15 text-warning"
                    }
                  >
                    {t.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/kanban"
            className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
          >
            Abrir Kanban
          </Link>
        </section>

        <section className="surface-panel p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Tarefas atrasadas
          </h2>
          {overdueTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa atrasada. 🎉</p>
          ) : (
            <ul className="space-y-2">
              {overdueTasks.slice(0, 6).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.board === "socios" ? "Sócios" : "Colaboradores"} · venceu{" "}
                      {formatDate(t.due_date)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
