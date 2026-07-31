"use client"

import { useMemo, useState } from "react"
import { CalendarDays, Loader2, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useTable } from "@/lib/use-data"
import { isSocio, type Colaborador } from "@/lib/types"
import type { ContextoKanban, StatusKanban, TarefaKanban } from "@/lib/kanban-data"
import { formatDate, todayISO } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { ConfirmDeleteButton } from "@/components/confirm-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const COLUNAS_SOCIOS: { status: StatusKanban; label: string }[] = [
  { status: "nao_realizado", label: "Não realizado" },
  { status: "em_andamento", label: "Em andamento" },
  { status: "concluido", label: "Concluído" },
]
const COLUNAS_COLABORADORES: { status: StatusKanban; label: string }[] = [
  { status: "nao_realizado", label: "Não realizado" },
  { status: "em_andamento", label: "Em andamento" },
  { status: "concluido", label: "Concluído" },
]

const vazio = { titulo: "", descricao: "", responsavel_id: "", prazo: "" }

export function KanbanView() {
  const supabase = createClient()
  const { data: tarefas, isLoading, mutate } = useTable<TarefaKanban>("kanban_tarefas", {
    column: "created_at",
    ascending: false,
  })
  const { data: pessoas } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const [contexto, setContexto] = useState<ContextoKanban>("colaboradores")
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(vazio)
  const [saving, setSaving] = useState(false)

  const responsaveis = useMemo(
    () => pessoas.filter((p) => p.ativo && (contexto === "socios" ? isSocio(p) : !isSocio(p))),
    [pessoas, contexto],
  )
  const colunas = contexto === "socios" ? COLUNAS_SOCIOS : COLUNAS_COLABORADORES

  function abrirNovo() {
    setEditId(null)
    setForm(vazio)
    setOpen(true)
  }

  function editar(tarefa: TarefaKanban) {
    setEditId(tarefa.id)
    setForm({
      titulo: tarefa.titulo,
      descricao: tarefa.descricao ?? "",
      responsavel_id: tarefa.responsavel_id,
      prazo: tarefa.prazo ?? "",
    })
    setOpen(true)
  }

  async function salvar() {
    if (!form.titulo.trim() || !form.responsavel_id) {
      toast.error("Informe o título e a pessoa responsável.")
      return
    }
    const responsavel = responsaveis.find((p) => p.id === form.responsavel_id)
    if (!responsavel) {
      toast.error(`Selecione ${contexto === "socios" ? "um sócio" : "um colaborador"} válido.`)
      return
    }
    setSaving(true)
    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      contexto,
      responsavel_id: responsavel.id,
      responsavel_nome: responsavel.nome,
      prazo: form.prazo || null,
      ...(!editId ? { status: "nao_realizado" } : {}),
    }
    const result = editId
      ? await supabase.from("kanban_tarefas").update(payload).eq("id", editId).select("id").single()
      : await supabase.from("kanban_tarefas").insert(payload).select("id").single()
    const { error } = result
    setSaving(false)
    if (error) return toast.error("Não foi possível salvar. Verifique se a migração do banco foi aplicada.")
    if (!editId && result.data?.id) {
      void fetch("/api/notifications/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "tarefa", id: result.data.id }),
      }).catch(() => undefined)
    }
    toast.success(editId ? "Tarefa atualizada." : "Tarefa criada.")
    setOpen(false)
    mutate()
  }

  async function mover(tarefa: TarefaKanban, status: StatusKanban) {
    const { error } = await supabase.from("kanban_tarefas").update({ status }).eq("id", tarefa.id)
    if (error) return toast.error("Não foi possível mover a tarefa.")
    mutate()
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("kanban_tarefas").delete().eq("id", id)
    if (error) {
      toast.error("Não foi possível excluir.")
      return
    }
    toast.success("Tarefa excluída.")
    mutate()
  }

  return (
    <div>
      <PageHeader
        title="Kanban"
        description="Organize as responsabilidades de sócios e colaboradores em fluxos separados."
        action={<Button onClick={abrirNovo}><Plus className="size-4" />Nova tarefa</Button>}
      />
      <Tabs value={contexto} onValueChange={(value) => setContexto(value as ContextoKanban)} className="mb-5">
        <TabsList>
          <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
          <TabsTrigger value="socios">Sócios</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-3">
        {colunas.map((coluna) => {
          const itens = tarefas.filter(
            (t) =>
              t.contexto === contexto &&
              (t.status === coluna.status || (coluna.status === "nao_realizado" && t.status === "a_fazer")),
          )
          return (
            <Card key={coluna.status} className="min-h-64">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{coluna.label}</CardTitle>
                <Badge variant="secondary">{itens.length}</Badge>
              </CardHeader>
              <CardContent className="grid gap-3">
                {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : itens.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma tarefa.</p>
                ) : itens.map((tarefa) => (
                  <div key={tarefa.id} className="rounded-lg border bg-background p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{tarefa.titulo}</p>
                      <div className="flex">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => editar(tarefa)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <ConfirmDeleteButton onConfirm={() => excluir(tarefa.id)} />
                      </div>
                    </div>
                    {tarefa.descricao && <p className="mt-1 text-sm text-muted-foreground">{tarefa.descricao}</p>}
                    <p className="mt-3 text-xs font-medium">Responsável: {tarefa.responsavel_nome}</p>
                    {tarefa.prazo && (
                      <p className={`mt-1 flex items-center gap-1 text-xs ${tarefa.prazo < todayISO() && tarefa.status !== "concluido" ? "text-destructive" : "text-muted-foreground"}`}>
                        <CalendarDays className="size-3" /> Prazo: {formatDate(tarefa.prazo)}
                      </p>
                    )}
                    <Select
                      value={tarefa.status === "a_fazer" ? "nao_realizado" : tarefa.status}
                      onValueChange={(status) => status && mover(tarefa, status as StatusKanban)}
                    >
                      <SelectTrigger className="mt-3 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {colunas.map((c) => <SelectItem key={c.status} value={c.status}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar tarefa" : "Nova tarefa"} · {contexto === "socios" ? "Sócios" : "Colaboradores"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="titulo-tarefa">Título</Label>
              <Input id="titulo-tarefa" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Pessoa responsável</Label>
              <Select value={form.responsavel_id} onValueChange={(responsavel_id) => setForm({ ...form, responsavel_id: responsavel_id ?? "" })}>
                <SelectTrigger><SelectValue placeholder={contexto === "socios" ? "Selecione um sócio" : "Selecione um colaborador"} /></SelectTrigger>
                <SelectContent>
                  {responsaveis.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {contexto === "socios" ? "Somente sócios aparecem nesta lista." : "Sócios não aparecem nas tarefas de colaboradores."}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="prazo-tarefa">Prazo</Label>
              <Input id="prazo-tarefa" type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="descricao-tarefa">Descrição</Label>
              <Textarea id="descricao-tarefa" rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
