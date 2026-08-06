"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, RotateCcw, Search, Send, Truck, Wallet } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mensagemErroSupabase } from "@/lib/supabase/friendly-error"
import { useTable } from "@/lib/use-data"
import type { Colaborador, Configuracao, Fornecedor, PagamentoFornecedor } from "@/lib/types"
import { formatBRL, formatDate, todayISO } from "@/lib/format"
import { enviarWhatsapp, preencherTemplate, TEMPLATE_KEYS } from "@/lib/whatsapp"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { ConfirmDeleteButton } from "@/components/confirm-button"
import { PaymentAttachmentField } from "@/components/payment-attachment-field"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Filtro = "todos" | "pendentes" | "pagos" | "vencidos"

const vazio = {
  pedido: "",
  vencimento: todayISO(),
  fornecedor: "",
  valor: "",
  observacao: "",
  responsavel: "",
  anexo_url: "",
  anexo_path: "",
  boleto_url: "",
  boleto_path: "",
  codigo_barras: "",
}

function labelMes(mes: string) {
  const [ano, numeroMes] = mes.split("-").map(Number)
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(ano, numeroMes - 1, 1))
}

export function PagamentosFornecedores() {
  const supabase = createClient()
  const { data, isLoading, mutate } = useTable<PagamentoFornecedor>("pagamentos_fornecedores", {
    column: "vencimento",
    ascending: true,
  })
  const { data: fornecedores } = useTable<Fornecedor>("fornecedores", { column: "nome" })
  const { data: pessoas } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const { data: config } = useTable<Configuracao>("configuracoes")

  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [periodo, setPeriodo] = useState(todayISO().slice(0, 7))
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
  const mesesDisponiveis = useMemo(
    () => Array.from(new Set(data.map((p) => p.vencimento.slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [data],
  )
  const dadosPeriodo = useMemo(
    () => periodo === "total" ? data : data.filter((p) => p.vencimento.slice(0, 7) === periodo),
    [data, periodo],
  )

  const filtrados = useMemo(() => {
    return dadosPeriodo.filter((p) => {
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
  }, [dadosPeriodo, busca, filtro, hoje])

  const totalPendente = dadosPeriodo.filter((p) => !p.pago_em).reduce((s, p) => s + (p.valor ?? 0), 0)
  const totalVencido = dadosPeriodo
    .filter((p) => !p.pago_em && p.vencimento < hoje)
    .reduce((s, p) => s + (p.valor ?? 0), 0)
  const totalPago = dadosPeriodo.filter((p) => p.pago_em).reduce((s, p) => s + (p.valor ?? 0), 0)
  const totalFiltrado = filtrados.reduce((s, p) => s + Number(p.valor ?? 0), 0)
  const periodoLabel = periodo === "total" ? "todos os períodos" : labelMes(periodo)

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
      anexo_url: p.anexo_url ?? "",
      anexo_path: p.anexo_path ?? "",
      boleto_url: p.boleto_url ?? "",
      boleto_path: p.boleto_path ?? "",
      codigo_barras: p.codigo_barras ?? "",
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
        anexo_url: form.anexo_path ? null : form.anexo_url || null,
        anexo_path: form.anexo_path || null,
        boleto_url: form.boleto_path ? null : form.boleto_url || null,
        boleto_path: form.boleto_path || null,
        codigo_barras: form.codigo_barras.trim() || null,
      }
      const result = editId
        ? await supabase.from("pagamentos_fornecedores").update(payload).eq("id", editId).select("id").single()
        : await supabase.from("pagamentos_fornecedores").insert(payload).select("id").single()
      const { error } = result
      if (error) throw error
      if (!editId && result.data?.id) {
        void fetch("/api/notifications/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: "fornecedor", id: result.data.id }),
        }).catch(() => undefined)
      }
      toast.success(editId ? "Conta atualizada." : "Conta adicionada.")
      setOpen(false)
      mutate()
    } catch (e) {
      console.log("[v0] erro salvar fornecedor:", e)
      toast.error(mensagemErroSupabase(e))
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
        action={<Button onClick={abrirNovo}><Plus className="size-4" />Nova conta</Button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={`A pagar · ${periodoLabel}`} value={formatBRL(totalPendente)} icon={Truck} tone="primary" />
        <StatCard label={`Vencido · ${periodoLabel}`} value={formatBRL(totalVencido)} icon={AlertTriangle} tone="warning" />
        <StatCard label={`Pago · ${periodoLabel}`} value={formatBRL(totalPago)} icon={Wallet} tone="success" />
      </div>

      <Card className="mb-4 flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
              <TabsTrigger value="vencidos">Vencidos</TabsTrigger>
              <TabsTrigger value="pagos">Pagos</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={periodo} onValueChange={(value) => value && setPeriodo(value)}>
            <SelectTrigger className="w-full lg:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="total">Todos os períodos</SelectItem>
              {mesesDisponiveis.map((mes) => <SelectItem key={mes} value={mes}>{labelMes(mes)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-full xl:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar fornecedor ou pedido" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
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
                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Nenhuma conta encontrada.</TableCell></TableRow>
              ) : (
                <>
                  {filtrados.map((p) => {
                    const vencido = !p.pago_em && p.vencimento < hoje
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-semibold">
                          {p.fornecedor}
                          {p.observacao && <span className="block max-w-52 truncate text-xs font-normal text-muted-foreground">{p.observacao}</span>}
                          {(p.boleto_path || p.boleto_url || p.codigo_barras) && <span className="block text-xs font-normal text-muted-foreground">Boleto cadastrado</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.pedido || "—"}</TableCell>
                        <TableCell className={vencido ? "font-semibold text-destructive" : ""}>{formatDate(p.vencimento)}</TableCell>
                        <TableCell className="text-right font-heading font-bold">{formatBRL(p.valor)}</TableCell>
                        <TableCell>
                          {p.pago_em ? <Badge className="bg-accent text-accent-foreground">Pago {formatDate(p.pago_em)}</Badge> : vencido ? <Badge variant="destructive">Vencido</Badge> : <Badge variant="secondary">Pendente</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => enviarLembrete(p)} disabled={enviandoId === p.id} aria-label="Enviar lembrete no WhatsApp" className="text-muted-foreground hover:text-primary">
                              {enviandoId === p.id ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => alternarPago(p)} aria-label={p.pago_em ? "Reabrir" : "Marcar como pago"} className={p.pago_em ? "text-muted-foreground" : "text-accent-foreground"}>
                              {p.pago_em ? <RotateCcw className="size-4" /> : <CheckCircle2 className="size-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => abrirEdicao(p)} aria-label="Editar"><Pencil className="size-4" /></Button>
                            <ConfirmDeleteButton onConfirm={() => excluir(p.id)} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell colSpan={3} className="text-right font-semibold">Total dos registros filtrados</TableCell>
                    <TableCell className="text-right font-heading text-lg font-extrabold text-primary">{formatBRL(totalFiltrado)}</TableCell>
                    <TableCell colSpan={2} className="text-xs text-muted-foreground">{filtrados.length} lançamento(s)</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Editar conta" : "Nova conta a pagar"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="fornecedor">Fornecedor</Label>
              <Input id="fornecedor" list="lista-fornecedores" value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} placeholder="Nome do fornecedor" />
              <datalist id="lista-fornecedores">{fornecedores.map((f) => <option key={f.id} value={f.nome} />)}</datalist>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pedido">Nº do pedido</Label>
              <Input id="pedido" value={form.pedido} onChange={(e) => setForm({ ...form, pedido: e.target.value })} placeholder="Opcional" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="valor">Valor (R$)</Label>
              <Input id="valor" type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vencimento">Vencimento</Label>
              <Input id="vencimento" type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Responsável pelo pagamento</Label>
              <Select value={form.responsavel || "sem_responsavel"} onValueChange={(nome) => setForm({ ...form, responsavel: nome === "sem_responsavel" ? "" : nome ?? "" })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem_responsavel">Não definido (avisar sócios)</SelectItem>
                  {pessoas.filter((p) => p.ativo).map((p) => <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="codigo-barras">Código de barras do boleto (opcional)</Label>
              <Textarea id="codigo-barras" value={form.codigo_barras} onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })} rows={3} placeholder="Cole a linha digitável ou o código de barras" className="font-mono text-xs" />
            </div>
            <PaymentAttachmentField
              url={form.boleto_url}
              path={form.boleto_path}
              onChange={(boleto) => setForm({ ...form, boleto_url: boleto.url, boleto_path: boleto.path })}
              label="Boleto para pagamento (opcional)"
              helper="PDF, JPG, PNG ou WebP · máximo 5 MB."
              previewAlt="Prévia do boleto"
              storageFolder="boletos"
              allowPdf
            />
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="obs">Observação</Label>
              <Textarea id="obs" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} rows={2} />
            </div>
            <PaymentAttachmentField
              url={form.anexo_url}
              path={form.anexo_path}
              onChange={(anexo) => setForm({ ...form, anexo_url: anexo.url, anexo_path: anexo.path })}
              label="Comprovante do pagamento (opcional)"
              storageFolder="comprovantes-fornecedores"
            />
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
