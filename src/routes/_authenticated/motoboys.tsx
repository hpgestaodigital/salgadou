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
import { money, formatDate, todayISO, statusTone } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/motoboys")({
  head: () => ({
    meta: [
      { title: "Pagamentos de motoboys | Salgadou Gestão" },
      {
        name: "description",
        content: "Fechamento diário de entregas, taxas e diárias dos motoboys da Salgadou.",
      },
      { property: "og:title", content: "Pagamentos de motoboys | Salgadou Gestão" },
      {
        property: "og:description",
        content: "Fechamento diário de entregas e diárias dos motoboys.",
      },
    ],
  }),
  component: CourierPayments,
});

type Form = {
  work_date: string;
  courier_id: string;
  deliveries: string;
  fees_amount: string;
  daily_amount: string;
  pix_key: string;
  paid_at: string;
  status: "pendente" | "pago" | "cancelado";
  notes: string;
  receipt_url: string | null;
  responsible_id: string;
};

const emptyForm = (): Form => ({
  work_date: todayISO(),
  courier_id: "",
  deliveries: "0",
  fees_amount: "0",
  daily_amount: "0",
  pix_key: "",
  paid_at: "",
  status: "pendente",
  notes: "",
  receipt_url: null,
  responsible_id: "",
});

function CourierPayments() {
  const qc = useQueryClient();
  const remind = useServerFn(sendManualReminder);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState("todos");

  const { data: couriers } = useQuery({
    queryKey: ["couriers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("couriers")
        .select("id, name, pix_key, default_daily_rate")
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
    queryKey: ["courier-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courier_payments")
        .select("*, couriers(name)")
        .is("deleted_at", null)
        .order("work_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        work_date: form.work_date,
        courier_id: form.courier_id || null,
        deliveries: Number(form.deliveries || 0),
        fees_amount: Number(form.fees_amount || 0),
        daily_amount: Number(form.daily_amount || 0),
        pix_key: form.pix_key || null,
        paid_at: form.status === "pago" ? form.paid_at || todayISO() : null,
        status: form.status,
        notes: form.notes || null,
        receipt_url: form.receipt_url,
        responsible_id: form.responsible_id || null,
      };
      if (editingId) {
        const { error } = await supabase
          .from("courier_payments")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courier_payments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courier-payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Fechamento salvo.");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("courier_payments")
        .update({ status: "pago", paid_at: todayISO() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courier-payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Fechamento marcado como pago.");
    },
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("courier_payments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courier-payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Fechamento excluído.");
      setToDelete(null);
    },
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === "todos") return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(row: (typeof filtered)[number]) {
    setEditingId(row.id);
    setForm({
      work_date: row.work_date,
      courier_id: row.courier_id ?? "",
      deliveries: String(row.deliveries ?? 0),
      fees_amount: String(row.fees_amount ?? 0),
      daily_amount: String(row.daily_amount ?? 0),
      pix_key: row.pix_key ?? "",
      paid_at: row.paid_at ?? "",
      status: row.status,
      notes: row.notes ?? "",
      receipt_url: row.receipt_url,
      responsible_id: row.responsible_id ?? "",
    });
    setOpen(true);
  }

  function pickCourier(id: string) {
    const c = couriers?.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      courier_id: id,
      pix_key: c?.pix_key ?? f.pix_key,
      daily_amount: c ? String(c.default_daily_rate ?? 0) : f.daily_amount,
    }));
  }

  function submit() {
    if (!form.courier_id) return toast.error("Selecione o motoboy.");
    if (!form.work_date) return toast.error("Informe a data.");
    save.mutate();
  }

  async function sendReminder(id: string) {
    const res = await remind({ data: { kind: "pagamento_motoboy", id } });
    if (res.ok) toast.success("Lembrete enviado.");
    else toast.error(res.error ?? "Falha ao enviar lembrete.");
  }

  const totalOpen = filtered
    .filter((r) => r.status === "pendente")
    .reduce((a, r) => a + Number(r.fees_amount) + Number(r.daily_amount), 0);

  const formTotal = Number(form.fees_amount || 0) + Number(form.daily_amount || 0);

  return (
    <div>
      <PageHeader
        title="Pagamentos — Motoboys"
        subtitle={`Em aberto: ${money(totalOpen)}`}
        actions={
          <>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" /> Novo fechamento
            </Button>
          </>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhum fechamento registrado"
          description="Registre o fechamento diário do motoboy com entregas, taxas e diária."
          action={
            <Button className="mt-2" onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" /> Novo fechamento
            </Button>
          }
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Motoboy</th>
                <th className="px-3 py-2 font-medium">Entregas</th>
                <th className="px-3 py-2 font-medium">Taxas</th>
                <th className="px-3 py-2 font-medium">Diária</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Pago em</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">{formatDate(row.work_date)}</td>
                  <td className="px-3 py-2">{row.couriers?.name ?? "—"}</td>
                  <td className="px-3 py-2">{row.deliveries}</td>
                  <td className="px-3 py-2">{money(row.fees_amount)}</td>
                  <td className="px-3 py-2">{money(row.daily_amount)}</td>
                  <td className="px-3 py-2 font-medium">
                    {money(Number(row.fees_amount) + Number(row.daily_amount))}
                  </td>
                  <td className="px-3 py-2">{formatDate(row.paid_at)}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={statusTone(
                        row.status === "pago"
                          ? "Pago"
                          : row.status === "cancelado"
                            ? "Cancelado"
                            : "Pendente",
                      )}
                    >
                      {row.status}
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
                        aria-label="Enviar fechamento"
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar fechamento" : "Novo fechamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={form.work_date}
                onChange={(e) => setForm({ ...form, work_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Motoboy</Label>
              <Select value={form.courier_id} onValueChange={pickCourier}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {couriers?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nº de entregas</Label>
              <Input
                type="number"
                value={form.deliveries}
                onChange={(e) => setForm({ ...form, deliveries: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor das taxas</Label>
              <Input
                type="number"
                step="0.01"
                value={form.fees_amount}
                onChange={(e) => setForm({ ...form, fees_amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor da diária</Label>
              <Input
                type="number"
                step="0.01"
                value={form.daily_amount}
                onChange={(e) => setForm({ ...form, daily_amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Total</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-secondary/40 px-3 text-sm font-semibold">
                {money(formTotal)}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>PIX</Label>
              <Input
                value={form.pix_key}
                onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
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
            <div className="space-y-1.5 sm:col-span-2">
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
        title="Excluir fechamento?"
        description="O fechamento sairá das listagens, mas o histórico é preservado."
        onConfirm={() => toDelete && softDelete.mutate(toDelete)}
      />
    </div>
  );
}
