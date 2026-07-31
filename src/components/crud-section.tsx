import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CrudField = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "switch" | "select" | "tel";
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string | number | boolean;
  hideInTable?: boolean;
};

type Row = Record<string, unknown> & { id: string };

export function CrudSection({
  table,
  title,
  singular,
  fields,
  orderBy = "name",
}: {
  table: string;
  title: string;
  singular: string;
  fields: CrudField[];
  orderBy?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [toDelete, setToDelete] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["crud", table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as never)
        .select("*")
        .order(orderBy);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editing) {
        const { error } = await supabase
          .from(table as never)
          .update(payload as never)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crud", table] });
      toast.success(editing ? "Registro atualizado." : "Registro criado.");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase
        .from(table as never)
        .update({ active: false } as never)
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crud", table] });
      toast.success("Registro inativado.");
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setEditing(null);
    const initial: Record<string, unknown> = {};
    fields.forEach((f) => {
      initial[f.name] = f.defaultValue ?? (f.type === "switch" ? false : "");
    });
    setForm(initial);
    setOpen(true);
  }

  function openEdit(row: Row) {
    setEditing(row);
    const initial: Record<string, unknown> = {};
    fields.forEach((f) => {
      initial[f.name] = row[f.name] ?? (f.type === "switch" ? false : "");
    });
    setForm(initial);
    setOpen(true);
  }

  function submit() {
    for (const f of fields) {
      if (f.required && !String(form[f.name] ?? "").trim()) {
        toast.error(`Preencha o campo "${f.label}".`);
        return;
      }
    }
    const payload: Record<string, unknown> = {};
    fields.forEach((f) => {
      const v = form[f.name];
      payload[f.name] =
        f.type === "number"
          ? Number(v || 0)
          : f.type === "switch"
            ? Boolean(v)
            : v === ""
              ? null
              : v;
    });
    save.mutate(payload);
  }

  const visibleFields = fields.filter((f) => !f.hideInTable).slice(0, 5);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> Novo {singular}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title={`Nenhum ${singular} cadastrado`}
          description={`Cadastre o primeiro ${singular} para começar.`}
          action={
            <Button size="sm" className="mt-2" onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" /> Novo {singular}
            </Button>
          }
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                {visibleFields.map((f) => (
                  <th key={f.name} className="px-3 py-2 font-medium">
                    {f.label}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  {visibleFields.map((f) => (
                    <td key={f.name} className="px-3 py-2">
                      {f.type === "switch"
                        ? row[f.name]
                          ? "Sim"
                          : "Não"
                        : f.type === "number"
                          ? Number(row[f.name] ?? 0).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                            })
                          : String(row[f.name] ?? "—")}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={
                        row.active
                          ? "border-success/30 bg-success/15 text-success"
                          : "border-border bg-muted text-muted-foreground"
                      }
                    >
                      {row.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(row)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {row.active ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setToDelete(row)}
                          aria-label="Inativar"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Editar ${singular}` : `Novo ${singular}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={f.name}>{f.label}</Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={f.name}
                    value={String(form[f.name] ?? "")}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  />
                ) : f.type === "switch" ? (
                  <div className="pt-1">
                    <Switch
                      id={f.name}
                      checked={Boolean(form[f.name])}
                      onCheckedChange={(v) => setForm({ ...form, [f.name]: v })}
                    />
                  </div>
                ) : f.type === "select" ? (
                  <Select
                    value={String(form[f.name] ?? "")}
                    onValueChange={(v) => setForm({ ...form, [f.name]: v })}
                  >
                    <SelectTrigger id={f.name}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={f.name}
                    type={f.type === "number" ? "number" : f.type === "tel" ? "tel" : "text"}
                    step={f.type === "number" ? "0.01" : undefined}
                    value={String(form[f.name] ?? "")}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  />
                )}
              </div>
            ))}
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
        title={`Inativar ${singular}?`}
        description="O registro ficará inativo, preservando o histórico já lançado."
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </div>
  );
}
