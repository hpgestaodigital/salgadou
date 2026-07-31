import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FileUploadField } from "@/components/file-upload-field";
import { sendManualReminder } from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  money,
  formatDate,
  todayISO,
  supplierPaymentStatus,
  statusTone,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({
    meta: [
      { title: "Pagamentos de fornecedores | Salgadou Gestão" },
      {
        name: "description",
        content: "Controle de contas a pagar e comprovantes dos fornecedores da Salgadou.",
      },
      { property: "og:title", content: "Pagamentos de fornecedores | Salgadou Gestão" },
      {
        property: "og:description",
        content: "Controle de contas a pagar dos fornecedores da Salgadou.",
      },
    ],
  }),
  component: SupplierPayments,
});

type Form = {
  order_date: string;
  due_date: string;
  supplier_id: string;
  description: string;
  amount: string;
  notes: string;
  paid_at: string;
  status: "pendente" | "pago" | "cancelado";
  payment_method: string;
  payment_detail: string;
  receipt_url: string | null;
  responsible_id: string;
};

const emptyForm = (): Form => ({
  order_date: todayISO(),
  due_date: todayISO(),
  supplier_id: "",
  description: "",
  amount: "",
  notes: "",
  paid_at: "",
  status: "pendente",
  payment_method: "pix",
  payment_detail: "",
  receipt_url: null,
  responsible_id: "",
});

function SupplierPayments() {
  const qc = useQueryClient();
  const remind = useServerFn(sendManualReminder);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState("todos");

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, phone")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["supplier-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_payments")
        .select("*, suppliers(name)")
        .is("deleted_at", null)
        .order("due_date");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        order_date: form.order_date || null,
        due_date: form.due_date,
        supplier_id: form.supplier_id || null,
        description: form.description || null,
        amount: Number(form.amount || 0),
        notes: form.notes || null,
        paid_at: form.status === "pago" ? form.paid_at || todayISO() : null,
        status: form.status,
        payment_method: form.payment_method || null,
        payment_detail: form.payment_detail || null,
        receipt_url: form.receipt_url,
        responsible_id: form.responsible_id || null,
      };
      if (editingId) {
        const { error } = await supabase
          .from("supplier_payments")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("supplier_payments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Pagamento salvo.");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("supplier_payments")
        .update({ status: "pago", paid_at: todayISO() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Pagamento marcado como pago.");
    },
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("supplier_payments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Lançamento excluído.");
      setToDelete(null);
    },
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === "todos") return rows;
    return rows.filter((r) => supplierPaymentStatus(r) === filter);
  }, [rows, filter]);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(row: (typeof filtered)[number]) {
    setEditingId(row.id);
    setForm({
      order_date: row.order_date ?? "",
      due_date: row.due_date,
      supplier_id: row.supplier_id ?? "",
      description: row.description ?? "",
      amount: String(row.amount ?? ""),
      notes: row.notes ?? "",
      paid_at: row.paid_at ?? "",
      status: row.status,
      payment_method: row.payment_method ?? "pix",
      payment_detail: row.payment_detail ?? "",
      receipt_url: row.receipt_url,
      responsible_id: row.responsible_id ?? "",
    });
    setOpen(true);
  }

  function submit() {
    if (!form.supplier_id) return toast.error("Selecione o fornecedor.");
    if (!form.due_date) return toast.error("Informe o vencimento.");
    if (!form.amount || Number(form.amount) <= 0)
      return toast.error("Informe um valor válido.");
    save.mutate();
  }

  async function sendReminder(id: string) {
    const res = await remind({ data: { kind: "pagamento_fornecedor", id } });
    if (res.ok) toast.success("Lembrete enviado.");
    else toast.error(res.error ?? "Falha ao enviar lembrete.");
  }

  const total = filtered
    .filter((r) => r.status === "pendente")
    .reduce((a, r) => a + Number(r.amount), 0);

  return (
    <div>
      <PageHeader
        title="Pagamentos — Fornecedores"
        subtitle={`Em aberto: ${money(total)}`}
        actions={
          <>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["todos", "Pendente", "Vence hoje", "Vence amanhã", "Vencido", "Pago", "Cancelado"].map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {s === "todos" ? "Todos os status" : s}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Button onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" /> Novo pagamento
            </Button>
          </>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhum pagamento encontrado"
          description="Cadastre um pagamento de fornecedor para acompanhar vencimentos."
          action={
            <Button className="mt-2" onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" /> Novo pagamento
            </Button>
          }
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 font-medium">Vencimento</th>
                <th className="px-3 py-2 font-medium">Fornecedor</th>
                <th className="px-3 py-2 font-medium">Descrição</th>
                <th className="px-3 py-2 font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Forma</th>
                <th className="px-3 py-2 font-medium">Pago em</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const s = supplierPaymentStatus(row);
                return (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">{formatDate(row.due_date)}</td>
                    <td className="px-3 py-2">{row.suppliers?.name ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2">
                      {row.description ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-medium">{money(row.amount)}</td>
                    <td className="px-3 py-2 uppercase">{row.payment_method ?? "—"}</td>
                    <td className="px-3 py-2">{formatDate(row.paid_at)}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={statusTone(s)}>
                        {s}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {row.status === "pendente" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Marcar como pago"
                            onClick={() => markPaid.mutate(row.id)}
                          >
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Enviar lembrete"
                          onClick={() => void sendReminder(row.id)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Editar"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Excluir"
                          onClick={() => setToDelete(row.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar pagamento" : "Novo pagamento"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data do pedido</Label>
              <Input
                type="date"
                value={form.order_date}
                onChange={(e) => setForm({ ...form, order_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Fornecedor</Label>
              <Select
                value={form.supplier_id}
                onValueChange={(v) => setForm({ ...form, supplier_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Pedido / itens"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as Form["status"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) => setForm({ ...form, payment_method: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="link">Link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>PIX / código / link</Label>
              <Input
                value={form.payment_detail}
                onChange={(e) => setForm({ ...form, payment_detail: e.target.value })}
              />
            </div>
            {form.status === "pago" && (
              <div className="space-y-1.5">
                <Label>Pago em</Label>
                <Input
                  type="date"
                  value={form.paid_at}
                  onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select
                value={form.responsible_id}
                onValueChange={(v) => setForm({ ...form, responsible_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {profiles?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observação</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <FileUploadField
                bucket="comprovantes"
                value={form.receipt_url}
                onChange={(p) => setForm({ ...form, receipt_url: p })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Excluir lançamento?"
        description="O lançamento sairá das listagens, mas o histórico é preservado."
        onConfirm={() => toDelete && softDelete.mutate(toDelete)}
      />
    </div>
  );
}
