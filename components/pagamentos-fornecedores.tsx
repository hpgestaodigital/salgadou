"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Loader2, Pencil, Plus, RotateCcw, Search, Send } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useTable } from "@/lib/use-data"
import type { Configuracao, Fornecedor, PagamentoFornecedor } from "@/lib/types"
import { formatBRL, formatDate, todayISO } from "@/lib/format"
import { enviarWhatsapp, preencherTemplate, TEMPLATE_KEYS } from "@/lib/whatsapp"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { ConfirmDeleteButton } from "@/components/confirm-button"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Truck, AlertTriangle, Wallet } from "lucide-react"

type Filtro = "todos" | "pendentes" | "pagos" | "vencidos"

const vazio = {
  pedido: "",
  vencimento: todayISO(),
  fornecedor: "",
  valor: "",
  observacao: "",
  responsavel: "",
}

export function PagamentosFornecedores() {
  const supabase = createClient()
  const { data, isLoading, mutate } = useTable<PagamentoFornecedor>("pagamentos_fornecedores", {
    column: "vencimento",
    ascending: true,
  })
  const { data: fornecedores } = useTable<Fornecedor>("fornecedores", { column: "nome" })
  const { data: config } = useTable<Configuracao>("configuracoes")

  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [busca, setBusca] = useState("")
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof vazio>(vazio)
  const [saving, setSaving] = useState(false)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)

  async function enviarLembrete(p: PagamentoFornecedor) {
    const f = fornecedores.find((x) => x.nome.toLowerCase() === p.fornecedor.toLowerCase())
    if (!f?.whatsapp) {
      toast.error("Fornecedor sem WhatsApp cadastrado em Cadastros.")
      return
    }
    const template =
      config.find((c) => c.chave === TEMPLATE_KEYS.fornecedor)?.valor ||
      "Lembrete de pagamento: pedido {pedido} - {fornecedor} - {valor} - vence {vencimento}."
    setEnviandoId(p.id)
    try {
      await enviarWhatsapp(
        f.whatsapp,
        preencherTemplate(template, {
          fornecedor: p.fornecedor,
          pedido: p.pedido ?? "—",
          valor: formatBRL(p.valor),
          vencimento: formatDate(p.vencimento),
        }),
      )
      toast.success("Lembrete enviado ao fornecedor.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar.")
    } finally {
      setEnviandoId(null)
    }
  }

  const hoje = todayISO()

  const filtrados = useMemo(() => {
    return data.filter((p) => {
      const matchBusca =
        !busca ||
        p.fornecedor.toLowerCase().includes(busca.toLowerCase()) ||
        (p.pedido ?? "").toLowerCase().includes(busca.toLowerCase())
      const vencido = !p.pago_em && p.vencimento < hoje
      const matchFiltro =
        filtro === "todos" ||
        (filtro === "pendentes" && !p.pago_em) ||
        (filtro === "pagos" && !!p.pago_em) ||
        (filtro === "vencidos" && vencido)
      return matchBusca && matchFiltro
    })
  }, [data, busca, filtro, hoje])

  const totalPendente = data.filter((p) => !p.pago_em).reduce((s, p) => s + (p.valor ?? 0), 0)
  const totalVencido = data
    .filter((p) => !p.pago_em && p.vencimento < hoje)
    .reduce((s, p) => s + (p.valor ?? 0), 0)
  const pagoMes = data
    .filter((p) => p.pago_em && p.pago_em.slice(0, 7) === hoje.slice(0, 7))
    .reduce((s, p) => s + (p.valor ?? 0), 0)

  function abrirNovo() {
    setEditId(null)
    setForm(vazio)
    setOpen(true)
  }

  function abrirEdicao(p: PagamentoFornecedor) {
    setEditId(p.id)
    setForm({
      pedido: p.pedido ?? "",
      vencimento: p.vencimento,
      fornecedor: p.fornecedor,
      valor: String(p.valor ?? ""),
      observacao: p.observacao ?? "",
      responsavel: p.responsavel ?? "",
    })
    setOpen(true)
  }

  async function salvar() {
    if (!form.fornecedor.trim()) {
      toast.error("Informe o fornecedor.")
      return
    }
    setSaving(true)
    try {
      const payload = {
        pedido: form.pedido || null,
        vencimento: form.vencimento,
        fornecedor: form.fornecedor.trim(),
        valor: Number(form.valor) || 0,
        observacao: form.observacao || null,
        responsavel: form.responsavel || null,
      }
      const { error } = editId
        ? await supabase.from("pagamentos_fornecedores").update(payload).eq("id", editId)
        : await supabase.from("pagamentos_fornecedores").insert(payload)
      if (error) throw error
      toast.success(editId ? "Conta atualizada." : "Conta adicionada.")
      setOpen(false)
      mutate()
    } catch (e) {
      console.log("[v0] erro salvar fornecedor:", e)
      toast.error("Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  async function alternarPago(p: PagamentoFornecedor) {
    const novo = p.pago_em ? null : todayISO()
    const { error } = await supabase.from("pagamentos_fornecedores").update({ pago_em: novo }).eq("id", p.id)
    if (error) {
      toast.error("Erro ao atualizar.")
      return
    }
    toast.success(novo ? "Marcado como pago." : "Reaberto.")
    mutate()
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("pagamentos_fornecedores").delete().eq("id", id)
    if (error) {
      toast.error("Erro ao excluir.")
      return
    }
    toast.success("Registro excluído.")
    mutate()
  }

  return (
    <div>
      <PageHeader
        title="Pagamentos a Fornecedores"
        description="Controle de contas a pagar, vencimentos e baixas."
        action={
          <Button onClick={abrirNovo}>
            <Plus className="size-4" />
            Nova conta
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-6">
        <StatCard label="A pagar (total)" value={formatBRL(totalPendente)} icon={Truck} tone="primary" />
        <StatCard label="Vencido" value={formatBRL(totalVencido)} icon={AlertTriangle} tone="warning" />
        <StatCard label="Pago no mês" value={formatBRL(pagoMes)} icon={Wallet} tone="success" />
      </div>

      <Card className="p-4 mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
            <TabsTrigger value="vencidos">Vencidos</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fornecedor ou pedido"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Fornecedor</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Nenhuma conta encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtrados.map((p) => {
                  const vencido = !p.pago_em && p.vencimento < hoje
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold">
                        {p.fornecedor}
                        {p.observacao && (
                          <span className="block text-xs font-normal text-muted-foreground truncate max-w-52">
                            {p.observacao}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.pedido || "—"}</TableCell>
                      <TableCell className={vencido ? "text-destructive font-semibold" : ""}>
                        {formatDate(p.vencimento)}
                      </TableCell>
                      <TableCell className="text-right font-heading font-bold">{formatBRL(p.valor)}</TableCell>
                      <TableCell>
                        {p.pago_em ? (
                          <Badge className="bg-accent text-accent-foreground">Pago {formatDate(p.pago_em)}</Badge>
                        ) : vencido ? (
                          <Badge variant="destructive">Vencido</Badge>
                        ) : (
                          <Badge variant="secondary">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => enviarLembrete(p)}
                            disabled={enviandoId === p.id}
                            aria-label="Enviar lembrete no WhatsApp"
                            className="text-muted-foreground hover:text-primary"
                          >
                            {enviandoId === p.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Send className="size-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => alternarPago(p)}
                            aria-label={p.pago_em ? "Reabrir" : "Marcar como pago"}
                            className={p.pago_em ? "text-muted-foreground" : "text-accent-foreground"}
                          >
                            {p.pago_em ? <RotateCcw className="size-4" /> : <CheckCircle2 className="size-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => abrirEdicao(p)} aria-label="Editar">
                            <Pencil className="size-4" />
                          </Button>
                          <ConfirmDeleteButton onConfirm={() => excluir(p.id)} />
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
          <DialogHeader>
            <DialogTitle>{editId ? "Editar conta" : "Nova conta a pagar"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="fornecedor">Fornecedor</Label>
              <Input
                id="fornecedor"
                list="lista-fornecedores"
                value={form.fornecedor}
                onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                placeholder="Nome do fornecedor"
              />
              <datalist id="lista-fornecedores">
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.nome} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pedido">Nº do pedido</Label>
              <Input
                id="pedido"
                value={form.pedido}
                onChange={(e) => setForm({ ...form, pedido: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="valor">Valor (R$)</Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vencimento">Vencimento</Label>
              <Input
                id="vencimento"
                type="date"
                value={form.vencimento}
                onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="responsavel">Responsável</Label>
              <Input
                id="responsavel"
                value={form.responsavel}
                onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                placeholder="Quem paga"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="obs">Observação</Label>
              <Textarea
                id="obs"
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                rows={2}
              />
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
