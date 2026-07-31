import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import {
  listInternalUsers,
  createInternalUser,
  updateInternalUser,
} from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários internos | Salgadou Gestão" },
      {
        name: "description",
        content: "Gestão de acessos dos sócios e do Master Admin do sistema Salgadou.",
      },
      { property: "og:title", content: "Usuários internos | Salgadou Gestão" },
      {
        property: "og:description",
        content: "Gestão de acessos dos sócios da Salgadou.",
      },
    ],
  }),
  component: UsersPage,
});

type Role = "master_admin" | "partner";

type Form = {
  id?: string;
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: Role;
  active: boolean;
};

const emptyForm = (): Form => ({
  email: "",
  password: "",
  full_name: "",
  phone: "",
  role: "partner",
  active: true,
});

function UsersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listInternalUsers);
  const create = useServerFn(createInternalUser);
  const update = useServerFn(updateInternalUser);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());

  const { data: users, isLoading } = useQuery({
    queryKey: ["internal-users"],
    queryFn: () => list({ data: undefined }),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (form.id) {
        return update({
          data: {
            id: form.id,
            full_name: form.full_name,
            phone: form.phone,
            active: form.active,
            role: form.role,
            password: form.password || undefined,
          },
        });
      }
      return create({
        data: {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          phone: form.phone,
          role: form.role,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal-users"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Usuário salvo.");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(u: NonNullable<typeof users>[number]) {
    setForm({
      id: u.id,
      email: u.email ?? "",
      password: "",
      full_name: u.full_name ?? "",
      phone: u.phone ?? "",
      role: u.role as Role,
      active: u.active,
    });
    setOpen(true);
  }

  function submit() {
    if (!form.full_name.trim()) return toast.error("Informe o nome.");
    if (!form.id) {
      if (!form.email.trim()) return toast.error("Informe o e-mail.");
      if (form.password.length < 6)
        return toast.error("A senha precisa ter ao menos 6 caracteres.");
    }
    save.mutate();
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Acesso exclusivo dos sócios e do Master Admin"
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Novo usuário
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="surface-panel overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">E-mail</th>
                <th className="px-3 py-2 font-medium">Telefone</th>
                <th className="px-3 py-2 font-medium">Perfil</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-medium">{u.full_name}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{u.phone ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={
                        u.role === "master_admin"
                          ? "border-primary/30 bg-primary/15 text-primary"
                          : ""
                      }
                    >
                      {u.role === "master_admin" ? "Master Admin" : "Sócio"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={
                        u.active
                          ? "border-success/30 bg-success/15 text-success"
                          : "text-muted-foreground"
                      }
                    >
                      {u.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Editar usuário"
                      onClick={() => openEdit(u)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                disabled={Boolean(form.id)}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone (WhatsApp)</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{form.id ? "Nova senha (opcional)" : "Senha"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as Role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner">Sócio</SelectItem>
                  <SelectItem value="master_admin">Master Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.id && (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label htmlFor="user-active">Usuário ativo</Label>
                <Switch
                  id="user-active"
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
              </div>
            )}
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
    </div>
  );
}
