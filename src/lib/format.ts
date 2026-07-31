export const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function money(value: number | null | undefined) {
  return BRL.format(Number(value ?? 0));
}

export function parseDateOnly(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return parseDateOnly(value.slice(0, 10)).toLocaleDateString("pt-BR");
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number) {
  const d = parseDateOnly(iso);
  d.setDate(d.getDate() + days);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** Segunda-feira da semana de uma data (ISO yyyy-mm-dd). */
export function weekStartISO(iso: string) {
  const d = parseDateOnly(iso);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export const WEEKDAYS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

export type PaymentDisplayStatus =
  | "Pendente"
  | "Vence amanhã"
  | "Vence hoje"
  | "Vencido"
  | "Pago"
  | "Cancelado";

export function supplierPaymentStatus(row: {
  status: string;
  due_date: string;
}): PaymentDisplayStatus {
  if (row.status === "pago") return "Pago";
  if (row.status === "cancelado") return "Cancelado";
  const today = todayISO();
  const due = row.due_date?.slice(0, 10);
  if (!due) return "Pendente";
  if (due < today) return "Vencido";
  if (due === today) return "Vence hoje";
  if (due === addDaysISO(today, 1)) return "Vence amanhã";
  return "Pendente";
}

export function statusTone(status: PaymentDisplayStatus) {
  switch (status) {
    case "Pago":
      return "bg-success/15 text-success border-success/30";
    case "Vencido":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "Vence hoje":
      return "bg-primary/15 text-primary border-primary/30";
    case "Vence amanhã":
      return "bg-warning/15 text-warning border-warning/30";
    case "Cancelado":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-secondary text-secondary-foreground border-border";
  }
}
