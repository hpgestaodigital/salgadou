"use client"

import { useState } from "react"
import { Loader2, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mensagemErroSupabase } from "@/lib/supabase/friendly-error"
import { useTable } from "@/lib/use-data"
import {
  TIPOS_COLABORADOR,
  isSocio,
  labelValorColaborador,
  type Colaborador,
} from "@/lib/types"
import { formatBRL } from "@/lib/format"
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

const vazio = {
  nome: "",
  funcao: "",
  whatsapp: "",
  tipo: "Diarista / Freelancer",
  modalidade: "diaria",
  periodicidade: "por_dia",
  valor: "",
  observacoes: "",
  ativo: true,
}

export function CadastroColaboradores({ contexto = "colaboradores" }: { contexto?: "socios" | "colaboradores" }) {
  const socio = contexto === "socios"
  const supabase = createClient()
  const { data, isLoading, mutate } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const exibidos = data.filter((pessoa) => (socio ? isSocio(pessoa) : !isSocio(pessoa)))

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(vazio)
  const [saving, setSaving] = useState(false)

  function abrirNovo() {
    setEditId(null)
    setForm({ ...vazio, tipo: socio ? "Sócio" : vazio.tipo })
    setOpen(true)
  }

  function abrirEdicao(c: Colaborador) {
    setEditId(c.id)
    setForm({
      nome: c.nome,
      funcao: c.funcao ?? "",
      whatsapp: c.whatsapp ?? "",
      tipo: socio ? "Sócio" : c.tipo ?? vazio.tipo,
      modalidade: socio ? "pro_labore" : c.modalidade_pagamento ?? (c.tipo?.startsWith("Diarista") ? "diaria" : "contrato"),
      periodicidade: socio ? "mensal" : c.periodicidade_pagamento ?? (c.tipo?.startsWith("Diarista") ? "por_dia" : "mensal"),
      valor: String(c.valor_pagamento ?? c.valor_diaria ?? ""),
      observacoes: c.observacoes_contrato ?? "",
      ativo: c.ativo,
    })
    setOpen(true)
  }

  async function salvar() {
    if (!form.nome.trim()) return toast.error("Informe o nome.")
    setSaving(true)
    try {
      const payloadBase = {
        nome: form.nome.trim(),
        funcao: form.funcao || null,
        whatsapp: form.whatsapp || null,
        tipo: socio ? "Sócio" : form.tipo,
        valor_diaria: Number(form.valor) || 0,
        ativo: form.ativo,
      }
      const payload = {
        ...payloadBase,
        modalidade_pagamento: socio ? "pro_labore" : form.modalidade,
        periodicidade_pagamento: socio ? "mensal" : form.periodicidade,
        valor_pagamento: Number(form.valor) || 0,
        observacoes_contrato: form.observacoes || null,
      }
      let { error } = editId
        ? await supabase.from("colaboradores").update(payload).eq("id", editId)
        : await supabase.from("colaboradores").insert(payload)
      if (error && (error.code === "PGRST204" || error.code === "42703")) {
        const legacyResult = editId
          ? await supabase.from("colaboradores").update(payloadBase).eq("id", editId)
          : await supabase.from("colaboradores").insert(payloadBase)
        error = legacyResult.error
      }
      if (error) throw error
      toast.success(editId ? "Cadastro atualizado." : `${socio ? "Sócio" : "Colaborador"} cadastrado.`)
      setOpen(false)
      mutate()
    } catch (error) {
      console.error(error)
      toast.error(mensagemErroSupabase(error))
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
    toast.success("Cadastro excluído.")
    mutate()
  }

  const tituloPessoa = socio ? "sócio" : "colaborador"
  const valorLabel = socio ? "Pró-labore" : "Remuneração"

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {socio
            ? "Sócios recebem pró-labore e permanecem separados da equipe operacional."
            : "Configure diaristas, freelancers e prestadores com pagamento fixo."}
        </p>
        <Button onClick={abrirNovo} className="shrink-0">
          <Plus className="size-4" />
          Novo {tituloPessoa}
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Nome</TableHead>
                <TableHead>Função</TableHead>
                {!socio && <TableHead>Forma de contratação</TableHead>}
                <TableHead>WhatsApp</TableHead>
                <TableHead className="text-right">{valorLabel}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center">Carregando...</TableCell></TableRow>
              ) : exibidos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhum {tituloPessoa} cadastrado.
                  </TableCell>
                </TableRow>
              ) : exibidos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-semibold">{c.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{c.funcao || "—"}</TableCell>
                  {!socio && <TableCell>{c.tipo || "—"}</TableCell>}
                  <TableCell className="text-muted-foreground">{c.whatsapp || "—"}</TableCell>
                  <TableCell className="text-right">
                    <span className="block">{formatBRL(c.valor_diaria)}</span>
                    {!socio && <span className="text-xs text-muted-foreground">{labelValorColaborador(c.tipo)}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => abrirEdicao(c)} aria-label="Editar">
                        <Pencil className="size-4" />
                      </Button>
                      <ConfirmDeleteButton onConfirm={() => excluir(c.id)} />
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
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Novo"} {tituloPessoa}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`${contexto}-nome`}>Nome</Label>
              <Input id={`${contexto}-nome`} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${contexto}-funcao`}>{socio ? "Área de atuação" : "Função / Serviço"}</Label>
              <Input
                id={`${contexto}-funcao`}
                value={form.funcao}
                onChange={(e) => setForm({ ...form, funcao: e.target.value })}
                placeholder={socio ? "Ex.: Financeiro" : "Ex.: Produção, design"}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${contexto}-wpp`}>WhatsApp</Label>
              <Input id={`${contexto}-wpp`} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
            {!socio && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Forma de contratação e pagamento</Label>
                <Select value={form.tipo} onValueChange={(tipo) => setForm({ ...form, tipo: tipo ?? "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_COLABORADOR.map((tipo) => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!socio && (
              <>
                <div className="grid gap-1.5">
                  <Label>Modelo de remuneração</Label>
                  <Select value={form.modalidade} onValueChange={(modalidade) => setForm({ ...form, modalidade: modalidade ?? "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria">Freelancer / Diária</SelectItem>
                      <SelectItem value="contrato">Prestador / Contrato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Periodicidade</Label>
                  <Select value={form.periodicidade} onValueChange={(periodicidade) => setForm({ ...form, periodicidade: periodicidade ?? "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="por_dia">Por dia trabalhado</SelectItem>
                      <SelectItem value="por_servico">Por serviço completo</SelectItem>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="quinzenal">Quinzenal</SelectItem>
                      <SelectItem value="mensal">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`${contexto}-valor`}>{socio ? "Pró-labore (R$)" : `${labelValorColaborador(form.tipo)} (R$)`}</Label>
              <Input
                id={`${contexto}-valor`}
                type="number"
                min="0"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder="0,00"
              />
              {!socio && (
                <p className="text-xs text-muted-foreground">
                  Para contratos, informe o valor integral referente à periodicidade selecionada.
                </p>
              )}
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={`${contexto}-observacoes`}>{socio ? "Observações do pró-labore" : "Condições e observações do contrato"}</Label>
              <Textarea
                id={`${contexto}-observacoes`}
                rows={3}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder={socio ? "Ex.: data prevista para pagamento" : "Ex.: escopo, vencimento, reajuste ou condições combinadas"}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-3 sm:col-span-2">
              <Label htmlFor={`${contexto}-ativo`}>Cadastro ativo</Label>
              <Switch id={`${contexto}-ativo`} checked={form.ativo} onCheckedChange={(ativo) => setForm({ ...form, ativo })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
