"use client"

import { useState } from "react"
import { Loader2, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mensagemErroSupabase } from "@/lib/supabase/friendly-error"
import { useTable } from "@/lib/use-data"
import { TIPOS_CHAVE_PIX, type Fornecedor, type PixTipo } from "@/lib/types"
import { ConfirmDeleteButton } from "@/components/confirm-button"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const vazio = { nome: "", whatsapp: "", pix: "", pix_tipo: "" as PixTipo | "", observacao: "", ativo: true }

function labelPix(tipo?: PixTipo | null) {
  return TIPOS_CHAVE_PIX.find((item) => item.value === tipo)?.label ?? "Tipo não informado"
}

export function CadastroFornecedores() {
  const supabase = createClient()
  const { data, isLoading, mutate } = useTable<Fornecedor>("fornecedores", { column: "nome" })
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof vazio>(vazio)
  const [saving, setSaving] = useState(false)

  function abrirNovo() {
    setEditId(null)
    setForm(vazio)
    setOpen(true)
  }

  function abrirEdicao(f: Fornecedor) {
    setEditId(f.id)
    setForm({
      nome: f.nome,
      whatsapp: f.whatsapp ?? "",
      pix: f.pix ?? "",
      pix_tipo: f.pix_tipo ?? "",
      observacao: f.observacao ?? "",
      ativo: f.ativo,
    })
    setOpen(true)
  }

  async function salvar() {
    if (!form.nome.trim()) return toast.error("Informe o nome.")
    if (form.pix && !form.pix_tipo) return toast.error("Selecione o tipo da chave PIX.")
    setSaving(true)
    try {
      const payload = {
        nome: form.nome.trim(),
        whatsapp: form.whatsapp || null,
        pix: form.pix || null,
        pix_tipo: form.pix ? form.pix_tipo || null : null,
        observacao: form.observacao || null,
        ativo: form.ativo,
      }
      const { error } = editId
        ? await supabase.from("fornecedores").update(payload).eq("id", editId)
        : await supabase.from("fornecedores").insert(payload)
      if (error) throw error
      toast.success(editId ? "Fornecedor atualizado." : "Fornecedor cadastrado.")
      setOpen(false)
      mutate()
    } catch (e) {
      console.log("[v0] erro salvar fornecedor cadastro:", e)
      toast.error(mensagemErroSupabase(e))
    } finally {
      setSaving(false)
    }
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("fornecedores").delete().eq("id", id)
    if (error) return toast.error("Erro ao excluir.")
    toast.success("Fornecedor excluído.")
    mutate()
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={abrirNovo}><Plus className="size-4" />Novo fornecedor</Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Nome</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Chave PIX</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Nenhum fornecedor cadastrado.</TableCell></TableRow>
              ) : data.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-semibold">{f.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{f.whatsapp || "—"}</TableCell>
                  <TableCell>
                    <span className="block text-muted-foreground">{f.pix || "—"}</span>
                    {f.pix && <span className="block text-xs text-muted-foreground">{labelPix(f.pix_tipo)}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-64 truncate">{f.observacao || "—"}</TableCell>
                  <TableCell>{f.ativo ? <Badge className="bg-accent text-accent-foreground">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => abrirEdicao(f)} aria-label="Editar"><Pencil className="size-4" /></Button>
                      <ConfirmDeleteButton onConfirm={() => excluir(f.id)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="nomeF">Nome</Label>
              <Input id="nomeF" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="wppF">WhatsApp</Label>
              <Input id="wppF" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(00) 00000-0000" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo da chave PIX</Label>
              <Select value={form.pix_tipo || "sem_tipo"} onValueChange={(value) => setForm({ ...form, pix_tipo: value === "sem_tipo" ? "" : value as PixTipo })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem_tipo">Não informado</SelectItem>
                  {TIPOS_CHAVE_PIX.map((tipo) => <SelectItem key={tipo.value} value={tipo.value}>{tipo.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pixF">Chave PIX</Label>
              <Input id="pixF" value={form.pix} onChange={(e) => setForm({ ...form, pix: e.target.value })} placeholder="Digite a chave" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="obsF">Observação</Label>
              <Textarea id="obsF" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} rows={2} placeholder="Produtos fornecidos, condições, etc." />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 sm:col-span-2">
              <Label htmlFor="ativoF">Fornecedor ativo</Label>
              <Switch id="ativoF" checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
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
