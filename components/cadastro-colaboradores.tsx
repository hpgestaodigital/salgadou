"use client"

import { useState } from "react"
import { Loader2, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useTable } from "@/lib/use-data"
import type { Colaborador } from "@/lib/types"
import { formatBRL } from "@/lib/format"
import { ConfirmDeleteButton } from "@/components/confirm-button"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const vazio = { nome: "", funcao: "", whatsapp: "", tipo: "Fixo", valor_diaria: "", ativo: true }

export function CadastroColaboradores() {
  const supabase = createClient()
  const { data, isLoading, mutate } = useTable<Colaborador>("colaboradores", { column: "nome" })

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof vazio>(vazio)
  const [saving, setSaving] = useState(false)

  function abrirNovo() {
    setEditId(null)
    setForm(vazio)
    setOpen(true)
  }

  function abrirEdicao(c: Colaborador) {
    setEditId(c.id)
    setForm({
      nome: c.nome,
      funcao: c.funcao ?? "",
      whatsapp: c.whatsapp ?? "",
      tipo: c.tipo ?? "Fixo",
      valor_diaria: String(c.valor_diaria ?? ""),
      ativo: c.ativo,
    })
    setOpen(true)
  }

  async function salvar() {
    if (!form.nome.trim()) {
      toast.error("Informe o nome.")
      return
    }
    setSaving(true)
    try {
      const payload = {
        nome: form.nome.trim(),
        funcao: form.funcao || null,
        whatsapp: form.whatsapp || null,
        tipo: form.tipo || null,
        valor_diaria: Number(form.valor_diaria) || 0,
        ativo: form.ativo,
      }
      const { error } = editId
        ? await supabase.from("colaboradores").update(payload).eq("id", editId)
        : await supabase.from("colaboradores").insert(payload)
      if (error) throw error
      toast.success(editId ? "Colaborador atualizado." : "Colaborador cadastrado.")
      setOpen(false)
      mutate()
    } catch (e) {
      console.log("[v0] erro salvar colaborador:", e)
      toast.error("Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("colaboradores").delete().eq("id", id)
    if (error) {
      toast.error("Erro ao excluir.")
      return
    }
    toast.success("Colaborador excluído.")
    mutate()
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={abrirNovo}>
          <Plus className="size-4" />
          Novo colaborador
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Nome</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead className="text-right">Diária</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhum colaborador cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold">{c.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{c.funcao || "—"}</TableCell>
                    <TableCell>{c.tipo || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.whatsapp || "—"}</TableCell>
                    <TableCell className="text-right">{formatBRL(c.valor_diaria)}</TableCell>
                    <TableCell>
                      {c.ativo ? (
                        <Badge className="bg-accent text-accent-foreground">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => abrirEdicao(c)} aria-label="Editar">
                          <Pencil className="size-4" />
                        </Button>
                        <ConfirmDeleteButton onConfirm={() => excluir(c.id)} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="funcao">Função</Label>
              <Input
                id="funcao"
                value={form.funcao}
                onChange={(e) => setForm({ ...form, funcao: e.target.value })}
                placeholder="Ex: Produção, Atendimento"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <Input
                id="tipo"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                placeholder="Fixo / Diarista"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wpp">WhatsApp</Label>
              <Input
                id="wpp"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="diaria">Valor da diária (R$)</Label>
              <Input
                id="diaria"
                type="number"
                step="0.01"
                value={form.valor_diaria}
                onChange={(e) => setForm({ ...form, valor_diaria: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 sm:col-span-2">
              <Label htmlFor="ativo">Colaborador ativo</Label>
              <Switch id="ativo" checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
