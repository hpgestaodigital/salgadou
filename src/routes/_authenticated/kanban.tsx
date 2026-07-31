import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatDate, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/kanban")({
  head: () => ({
    meta: [
      { title: "Kanban de tarefas | Salgadou Gestão" },
      {
        name: "description",
        content:
          "Quadros Kanban de sócios e colaboradores para acompanhar tarefas da Salgadou.",
      },
      { property: "og:title", content: "Kanban de tarefas | Salgadou Gestão" },
      {
        property: "og:description",
        content: "Quadros de sócios e colaboradores da Salgadou.",
      },
    ],
  }),
  component: KanbanPage,
});

type Board = "socios" | "colaboradores";
type Priority = "baixa" | "media" | "alta" | "urgente";

const COLUMNS: Record<Board, string[]> = {
  socios: ["Backlog", "A fazer", "Em andamento", "Concluído"],
  colaboradores: ["A fazer", "Em andamento", "Concluído", "Não realizado"],
};

const PRIORITY_TONE: Record<Priority, string> = {
  baixa: "bg-secondary text-secondary-foreground border-border",
  media: "bg-primary/15 text-primary border-primary/30",
  alta: "bg-warning/15 text-warning border-warning/30",
  urgente: "bg-destructive/15 text-destructive border-destructive/30",
};

type Form = {
  title: string;
  description: string;
  instructions: string;
  observations: string;
  not_done_reason: string;
  status: string;
  priority: Priority;
  due_date: string;
  owner_id: string;
  employee_id: string;
  area: string;
};

const emptyForm = (status: string): Form => ({
  title: "",
  description: "",
  instructions: "",
  observations: "",
  not_done_reason: "",
  status,
  priority: "media",
  due_date: todayISO(),
  owner_id: "",
  employee_id: "",
  area: "",
});

function KanbanPage() {
  const qc = useQueryClient();
  const [board, setBoard] = useState<Board>("socios");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm("A fazer"));
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [responsible, setResponsible] = useState("todos");
  const [priority, setPriority] = useState("todas");

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

  const { data: employees } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, daily_rate, role, phone")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: areas } = useQuery({
    queryKey: ["areas-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("areas")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ["tasks", board],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("board", board)
        .is("deleted_at", null)
        .order("position");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    return (tasks ?? []).filter((t) => {
      if (priority !== "todas" && t.priority !== priority) return false;
      if (responsible !== "todos") {
        const who = board === "socios" ? t.owner_id : t.employee_id;
        if (who !== responsible) return false;
      }
      return true;
    });
  }, [tasks, priority, responsible, board]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        board,
        title: form.title.trim(),
        description: form.description || null,
        instructions: form.instructions || null,
        observations: form.observations || null,
        not_done_reason: form.status === "Não realizado" ? form.not_done_reason || null : null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date || null,
        owner_id: board === "socios" ? form.owner_id || null : null,
        employee_id: board === "colaboradores" ? form.employee_id || null : null,
        area: form.area || null,
      };
      if (editingId) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", board] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Tarefa salva.");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", board] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", board] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Tarefa excluída.");
      setToDelete(null);
    },
  });

  function openNew(status: string) {
    setEditingId(null);
    setForm(emptyForm(status));
    setOpen(true);
  }

  function openEdit(task: (typeof filtered)[number]) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? "",
      instructions: task.instructions ?? "",
      observations: task.observations ?? "",
      not_done_reason: task.not_done_reason ?? "",
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ?? "",
      owner_id: task.owner_id ?? "",
      employee_id: task.employee_id ?? "",
      area: task.area ?? "",
    });
    setOpen(true);
  }

  function submit() {
    if (!form.title.trim()) return toast.error("Informe o título da tarefa.");
    save.mutate();
  }

  function nameOf(task: { owner_id: string | null; employee_id: string | null }) {
    if (board === "socios")
      return profiles?.find((p) => p.id === task.owner_id)?.full_name ?? "Sem responsável";
    return employees?.find((e) => e.id === task.employee_id)?.name ?? "Sem responsável";
  }

  const responsibleOptions =
    board === "socios"
      ? (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))
      : (employees ?? []).map((e) => ({ id: e.id, name: e.name }));

  return (
    <div>
      <PageHeader
        title="Kanban"
        subtitle="Quadros de sócios e colaboradores"
        actions={
          <>
            <Select value={responsible} onValueChange={setResponsible}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos responsáveis</SelectItem>
                {responsibleOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Prioridades</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => openNew(COLUMNS[board][0])}>
              <Plus className="mr-1 h-4 w-4" /> Nova tarefa
            </Button>
          </>
        }
      />

      <Tabs
        value={board}
        onValueChange={(v) => {
          setBoard(v as Board);
          setResponsible("todos");
        }}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="socios">Sócios</TabsTrigger>
          <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS[board].map((col) => {
          const items = filtered.filter((t) => t.status === col);
          return (
            <div
              key={col}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                if (id) moveTask.mutate({ id, status: col });
              }}
              className="surface-panel flex min-h-[240px] flex-col gap-2 p-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-semibold">{col}</p>
                <Badge variant="outline">{items.length}</Badge>
              </div>
              {items.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
                  className="cursor-grab rounded-lg border border-border bg-card p-3 active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{task.title}</p>
                    <div className="flex shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Editar tarefa"
                        onClick={() => openEdit(task)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Excluir tarefa"
                        onClick={() => setToDelete(task.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{nameOf(task)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={PRIORITY_TONE[task.priority]}>
                      {task.priority}
                    </Badge>
                    {task.due_date && (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(task.due_date)}
                      </span>
                    )}
                    {task.area && (
                      <Badge variant="outline" className="text-xs">
                        {task.area}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="mt-auto justify-start text-muted-foreground"
                onClick={() => openNew(col)}
              >
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMNS[board].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v as Priority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Área</Label>
              <Select value={form.area} onValueChange={(v) => setForm({ ...form, area: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {areas?.map((a) => (
                    <SelectItem key={a.id} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Responsável</Label>
              {board === "socios" ? (
                <Select
                  value={form.owner_id}
                  onValueChange={(v) => setForm({ ...form, owner_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o sócio" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={form.employee_id}
                  onValueChange={(v) => setForm({ ...form, employee_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees?.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Instruções</Label>
              <Textarea
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={form.observations}
                onChange={(e) => setForm({ ...form, observations: e.target.value })}
              />
            </div>
            {form.status === "Não realizado" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Motivo de não realização</Label>
                <Textarea
                  value={form.not_done_reason}
                  onChange={(e) => setForm({ ...form, not_done_reason: e.target.value })}
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

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Excluir tarefa?"
        description="A tarefa sairá do quadro, mas o histórico é preservado."
        onConfirm={() => toDelete && softDelete.mutate(toDelete)}
      />
    </div>
  );
}
