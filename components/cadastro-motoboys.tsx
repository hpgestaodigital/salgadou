"use client"

import { useState } from "react"
import { Loader2, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mensagemErroSupabase } from "@/lib/supabase/friendly-error"
import { useTable } from "@/lib/use-data"
import { TIPOS_CHAVE_PIX, type Motoboy, type PixTipo } from "@/lib/types"
import { formatBRL } from "@/lib/format"
import { ConfirmDeleteButton } from "@/components/confirm-button"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const vazio = { nome: "", pix: "", pix_tipo: "" as PixTipo | "", whatsapp: "", valor_diaria: "", ativo: true }

function labelPix(tipo?: PixTipo | null) {
  return TIPOS_CHAVE_PIX.find((item) => item.value === tipo)?.label ?? "Tipo não informado"
}

function inferirTipoPix(chave?: string | null): PixTipo | "" {
  const valor = (chave ?? "").trim().toLowerCase()
  if (!valor) return ""
  if (valor.includes("(cpf)")) return "cpf"
  if (valor.includes("(cnpj)")) return "cnpj"
  if (valor.includes("(celular)") || valor.includes("(telefone)")) return "celular"
  if (valor.includes("@")) return "email"
  return ""
}

export function CadastroMotoboys() {
  const supabase = createClient()
  const { data, isLoading, mutate } = useTable<Motoboy>("motoboys", { column: "nome" })

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof vazio>(vazio)
  const [saving, setSaving] = useState(false)

  function abrirNovo() {
    setEditId(null)
    setForm(vazio)
    setOpen(true)
  }

  function abrirEdicao(m: Motoboy) {
    setEditId(m.id)
    setForm({
      nome: m.nome,
      pix: m.pix ?? "",
      pix_tipo: m.pix_tipo ?? inferirTipoPix(m.pix),
      whatsapp: m.whatsapp ?? "",
      valor_diaria: String(m.valor_diaria ?? ""),
      ativo: m.ativo,
    })
    setOpen(true)
  }

  async function salvar() {
    if (!form.nome.trim()) {
      toast.error("Informe o nome.")
      return
    }

    const pix = form.pix.trim()
    const pixTipo = form.pix_tipo || inferirTipoPix(pix)

    if (pix && !pixTipo) {
      toast.error("Selecione o tipo da chave PIX.")
      return
    }

    setSaving(true)
    try {
      const payload = {
        nome: form.nome.trim(),
        pix: pix || null,
        pix_tipo: pix ? pixTipo || null : null,
        whatsapp: form.whatsapp.trim() || null,
        valor_diaria: Number(form.valor_diaria) || 0,
        ativo: form.ativo,
      }

      const consulta = editId
        ? supabase.from("motoboys").update(payload).eq("id", editId)
        : supabase.from("motoboys").insert(payload)

      const { data: salvo, error } = await consulta.select("id, pix, pix_tipo").single()
      if (error) throw error
      if (!salvo?.id) throw new Error("O banco não confirmou a atualização do motoboy.")
      if (pix && salvo.pix_tipo !== pixTipo) throw new Error("O tipo da chave PIX não foi persistido.")

      await mutate()
      toast.success(editId ? "Motoboy atualizado." : "Motoboy cadastrado.")
      setOpen(false)
    } catch (e) {
      console.log("[v0] erro salvar motoboy cadastro:", e)
      toast.error(mensagemErroSupabase(e))
    } finally {
      setSaving(false)
    }
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("motoboys").delete().eq("id", id)
    if (error) {
      toast.error("Erro ao excluir.")
      return
    }
    toast.success("Motoboy excluído.")
    mutate()
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={abrirNovo}>
          <Plus className="size-4" />
          Novo motoboy
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Nome</TableHead>
                <TableHead>Chave PIX</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead className="text-right">Diária</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Carregando...</TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Nenhum motoboy cadastrado.</TableCell>
                </TableRow>
              ) : (
                data.map((m) => {
                  const tipoPix = m.pix_tipo ?? inferirTipoPix(m.pix)
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-semibold">{m.nome}</TableCell>
                      <TableCell>
                        <span className="block text-muted-foreground">{m.pix || "—"}</span>
                        {m.pix && <span className="block text-xs text-muted-foreground">{labelPix(tipoPix || null)}</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.whatsapp || "—"}</TableCell>
                      <TableCell className="text-right">{formatBRL(m.valor_diaria)}</TableCell>
                      <TableCell>
                        {m.ativo ? <Badge className="bg-accent text-accent-foreground">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirEdicao(m)} aria-label="Editar"><Pencil className="size-4" /></Button>
                          <ConfirmDeleteButton onConfirm={() => excluir(m.id)} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar motoboy" : "Novo motoboy"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="nomeM">Nome</Label>
              <Input id="nomeM" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
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
              <Label htmlFor="pix">Chave PIX</Label>
              <Input id="pix" value={form.pix} onChange={(e) => setForm({ ...form, pix: e.target.value })} placeholder="Digite a chave" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wppM">WhatsApp</Label>
              <Input id="wppM" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(00) 00000-0000" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="diariaM">Valor da diária (R$)</Label>
              <Input id="diariaM" type="number" step="0.01" value={form.valor_diaria} onChange={(e) => setForm({ ...form, valor_diaria: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 sm:col-span-2">
              <Label htmlFor="ativoM">Motoboy ativo</Label>
              <Switch id="ativoM" checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
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
