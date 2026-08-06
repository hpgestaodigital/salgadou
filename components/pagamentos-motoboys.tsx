"use client"

import { useMemo, useState } from "react"
import { Bike, CheckCircle2, Loader2, Package, Pencil, Plus, RotateCcw, Search, Trash2, Wallet } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mensagemErroSupabase } from "@/lib/supabase/friendly-error"
import { useTable } from "@/lib/use-data"
import {
  TIPOS_CHAVE_PIX,
  type Colaborador,
  type Configuracao,
  type EntregaMotoboy,
  type Motoboy,
  type PagamentoMotoboy,
  type PixTipo,
} from "@/lib/types"
import { formatBRL, formatDate, todayISO } from "@/lib/format"
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

type Filtro = "todos" | "pendentes" | "pagos"

type EntregaDraft = {
  id: string
  identificador: string
  numero_entrega: string
  bairro: string
  valor_recebido: string
  comissao: string
}

const vazio = {
  data: todayISO(),
  motoboy_id: "",
  numero_entregas: "",
  valor_taxas: "",
  valor_diaria: "",
  observacao: "",
  responsavel: "",
  anexo_url: "",
  anexo_path: "",
  rastreio_anexo_url: "",
  rastreio_anexo_path: "",
}

const novaEntrega = (): EntregaDraft => ({
  id: crypto.randomUUID(),
  identificador: "",
  numero_entrega: "",
  bairro: "",
  valor_recebido: "",
  comissao: "",
})

function labelPix(tipo?: PixTipo | null) {
  return TIPOS_CHAVE_PIX.find((item) => item.value === tipo)?.label ?? "Tipo não informado"
}

function labelMes(mes: string) {
  const [ano, numeroMes] = mes.split("-").map(Number)
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(ano, numeroMes - 1, 1))
}

export function PagamentosMotoboys() {
  const supabase = createClient()
  const { data, isLoading, mutate } = useTable<PagamentoMotoboy>("pagamentos_motoboys", { column: "data", ascending: false })
  const { data: motoboys } = useTable<Motoboy>("motoboys", { column: "nome" })
  const { data: entregas, mutate: mutateEntregas } = useTable<EntregaMotoboy>("entregas_motoboy", { column: "created_at" })
  const { data: config } = useTable<Configuracao>("configuracoes")
  const { data: colaboradores } = useTable<Colaborador>("colaboradores", { column: "nome" })

  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [periodo, setPeriodo] = useState(todayISO().slice(0, 7))
  const [busca, setBusca] = useState("")
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof vazio>(vazio)
  const [entregasForm, setEntregasForm] = useState<EntregaDraft[]>([])
  const [saving, setSaving] = useState(false)

  const ativos = useMemo(() => motoboys.filter((m) => m.ativo), [motoboys])
  const mesesDisponiveis = useMemo(
    () => Array.from(new Set(data.map((p) => p.data.slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [data],
  )
  const dadosPeriodo = useMemo(
    () => periodo === "total" ? data : data.filter((p) => p.data.slice(0, 7) === periodo),
    [data, periodo],
  )

  const total = useMemo(() => {
    const comissoes = Number(form.valor_taxas) || 0
    const diaria = Number(form.valor_diaria) || 0
    return comissoes + diaria
  }, [form.valor_diaria, form.valor_taxas])

  const filtrados = useMemo(() => dadosPeriodo.filter((p) => {
    const matchBusca = !busca || (p.motoboy_nome ?? "").toLowerCase().includes(busca.toLowerCase())
    const matchFiltro = filtro === "todos" || (filtro === "pendentes" && !p.pago_em) || (filtro === "pagos" && !!p.pago_em)
    return matchBusca && matchFiltro
  }), [dadosPeriodo, busca, filtro])

  const totalFiltrado = useMemo(() => filtrados.reduce((soma, pagamento) => soma + Number(pagamento.total ?? 0), 0), [filtrados])
  const totalPendente = dadosPeriodo.filter((p) => !p.pago_em).reduce((s, p) => s + Number(p.total ?? 0), 0)
  const totalPago = dadosPeriodo.filter((p) => p.pago_em).reduce((s, p) => s + Number(p.total ?? 0), 0)
  const entregasPeriodo = dadosPeriodo.reduce((s, p) => s + Number(p.numero_entregas ?? 0), 0)
  const periodoLabel = periodo === "total" ? "todos os períodos" : labelMes(periodo)

  function motoboyDoPagamento(p: PagamentoMotoboy) {
    return motoboys.find((motoboy) => motoboy.id === p.motoboy_id)
  }

  function abrirNovo() {
    setEditId(null)
    setForm(vazio)
    setEntregasForm([])
    setOpen(true)
  }

  function abrirEdicao(p: PagamentoMotoboy) {
    setEditId(p.id)
    setForm({
      data: p.data,
      motoboy_id: p.motoboy_id ?? "",
      numero_entregas: String(p.numero_entregas ?? ""),
      valor_taxas: String(p.valor_taxas ?? ""),
      valor_diaria: String(p.valor_diaria ?? ""),
      observacao: p.observacao ?? "",
      responsavel: p.responsavel ?? "",
      anexo_url: p.anexo_url ?? "",
      anexo_path: p.anexo_path ?? "",
      rastreio_anexo_url: p.rastreio_anexo_url ?? "",
      rastreio_anexo_path: p.rastreio_anexo_path ?? "",
    })
    setEntregasForm(entregas.filter((entrega) => entrega.pagamento_id === p.id).map((entrega) => ({
      id: entrega.id,
      identificador: entrega.identificador ?? "",
      numero_entrega: entrega.numero_entrega ?? "",
      bairro: entrega.bairro ?? "",
      valor_recebido: String(entrega.valor_recebido ?? ""),
      comissao: String(entrega.comissao ?? ""),
    })))
    setOpen(true)
  }

  function selecionarMotoboy(id: string) {
    setForm((atual) => ({ ...atual, motoboy_id: id }))
  }

  async function salvar() {
    if (!form.motoboy_id) return toast.error("Selecione o motoboy.")
    if (form.valor_diaria.trim() === "") return toast.error("Informe a diária deste dia.")
    setSaving(true)
    try {
      const motoboy = motoboys.find((item) => item.id === form.motoboy_id)
      const payload = {
        data: form.data,
        motoboy_id: form.motoboy_id,
        motoboy_nome: motoboy?.nome ?? null,
        pix: motoboy?.pix ?? null,
        pix_tipo: motoboy?.pix_tipo ?? null,
        numero_entregas: Number(form.numero_entregas) || 0,
        valor_taxas: Number(form.valor_taxas) || 0,
        valor_diaria: Number(form.valor_diaria) || 0,
        total,
        observacao: form.observacao || null,
        responsavel: form.responsavel || null,
        anexo_url: form.anexo_path ? null : form.anexo_url || null,
        anexo_path: form.anexo_path || null,
        rastreio_anexo_url: form.rastreio_anexo_path ? null : form.rastreio_anexo_url || null,
        rastreio_anexo_path: form.rastreio_anexo_path || null,
      }
      const result = editId
        ? await supabase.from("pagamentos_motoboys").update(payload).eq("id", editId).select("id").single()
        : await supabase.from("pagamentos_motoboys").insert(payload).select("id").single()
      if (result.error) throw result.error

      const pagamentoId = result.data.id as string
      const { error: deleteError } = await supabase.from("entregas_motoboy").delete().eq("pagamento_id", pagamentoId)
      if (deleteError) throw deleteError

      const detalhes = entregasForm.filter((entrega) => entrega.identificador || entrega.numero_entrega || entrega.bairro || entrega.valor_recebido || entrega.comissao)
      if (detalhes.length) {
        const { error } = await supabase.from("entregas_motoboy").insert(detalhes.map((entrega) => ({
          pagamento_id: pagamentoId,
          identificador: entrega.identificador || null,
          numero_entrega: entrega.numero_entrega || null,
          bairro: entrega.bairro || null,
          valor_recebido: entrega.valor_recebido ? Number(entrega.valor_recebido) : null,
          comissao: entrega.comissao ? Number(entrega.comissao) : null,
        })))
        if (error) throw error
      }

      if (!editId) {
        void fetch("/api/notifications/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: "motoboy", id: pagamentoId }),
        }).catch(() => undefined)
      }

      toast.success(editId ? "Pagamento atualizado." : "Pagamento adicionado.")
      setOpen(false)
      await Promise.all([mutate(), mutateEntregas()])
    } catch (error) {
      console.error(error)
      toast.error(mensagemErroSupabase(error))
    } finally {
      setSaving(false)
    }
  }

  async function alternarPago(p: PagamentoMotoboy) {
    const novo = p.pago_em ? null : todayISO()
    const { error } = await supabase.from("pagamentos_motoboys").update({ pago_em: novo }).eq("id", p.id)
    if (error) return toast.error("Erro ao atualizar.")
    toast.success(novo ? "Marcado como pago." : "Reaberto.")
    mutate()
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("pagamentos_motoboys").delete().eq("id", id)
    if (error) return toast.error("Erro ao excluir.")
    toast.success("Registro excluído.")
    mutate()
  }

  return (
    <div>
      <PageHeader
        title="Pagamentos de Motoboys"
        description="Registre o total de comissões, a diária daquele dia e os dados de pagamento de cada motoboy."
        action={<Button onClick={abrirNovo}><Plus className="size-4" />Novo pagamento</Button>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={`A pagar · ${periodoLabel}`} value={formatBRL(totalPendente)} icon={Bike} tone="warning" />
        <StatCard label={`Pago · ${periodoLabel}`} value={formatBRL(totalPago)} icon={Wallet} tone="success" />
        <StatCard label={`Entregas · ${periodoLabel}`} value={`${entregasPeriodo}`} icon={Package} tone="primary" />
      </div>

      <Card className="mb-4 flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Tabs value={filtro} onValueChange={(value) => setFiltro(value as Filtro)}>
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
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
          <Input placeholder="Buscar motoboy" value={busca} onChange={(event) => setBusca(event.target.value)} className="pl-9" />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data</TableHead>
                <TableHead>Motoboy / PIX</TableHead>
                <TableHead className="text-center">Entregas</TableHead>
                <TableHead className="text-right">Comissões</TableHead>
                <TableHead className="text-right">Diária</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">Nenhum pagamento encontrado.</TableCell></TableRow>
              ) : (
                <>
                  {filtrados.map((p) => {
                    const motoboy = motoboyDoPagamento(p)
                    const pix = p.pix || motoboy?.pix
                    const pixTipo = p.pix_tipo || motoboy?.pix_tipo
                    const quantidadeDetalhada = entregas.filter((entrega) => entrega.pagamento_id === p.id).length
                    return (
                      <TableRow key={p.id}>
                        <TableCell>{formatDate(p.data)}</TableCell>
                        <TableCell className="font-semibold">
                          {p.motoboy_nome ?? motoboy?.nome ?? "—"}
                          <span className="block max-w-56 truncate text-xs font-normal text-muted-foreground">
                            {pix ? `PIX (${labelPix(pixTipo)}): ${pix}` : "PIX não cadastrado"}
                          </span>
                          {quantidadeDetalhada > 0 && <span className="block text-xs font-normal text-muted-foreground">{quantidadeDetalhada} entrega(s) detalhada(s)</span>}
                        </TableCell>
                        <TableCell className="text-center">{p.numero_entregas ?? 0}</TableCell>
                        <TableCell className="text-right">{formatBRL(p.valor_taxas)}</TableCell>
                        <TableCell className="text-right">{formatBRL(p.valor_diaria)}</TableCell>
                        <TableCell className="text-right font-heading font-bold">{formatBRL(p.total)}</TableCell>
                        <TableCell>{p.pago_em ? <Badge className="bg-accent text-accent-foreground">Pago {formatDate(p.pago_em)}</Badge> : <Badge variant="secondary">Pendente</Badge>}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => alternarPago(p)} aria-label={p.pago_em ? "Reabrir" : "Marcar como pago"}>
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
                    <TableCell colSpan={5} className="text-right font-semibold">Total dos registros filtrados</TableCell>
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
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Editar pagamento" : "Novo pagamento de motoboy"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Motoboy</Label>
              <Select value={form.motoboy_id} onValueChange={(id) => id && selecionarMotoboy(id)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o motoboy" /></SelectTrigger>
                <SelectContent>
                  {ativos.length === 0 ? <SelectItem value="none" disabled>Cadastre motoboys primeiro</SelectItem> : ativos.map((motoboy) => <SelectItem key={motoboy.id} value={motoboy.id}>{motoboy.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.motoboy_id && (() => {
                const motoboy = motoboys.find((item) => item.id === form.motoboy_id)
                return <p className="text-xs text-muted-foreground">{motoboy?.pix ? `PIX (${labelPix(motoboy.pix_tipo)}): ${motoboy.pix}` : "Este motoboy ainda não possui chave PIX cadastrada."}</p>
              })()}
            </div>
            <div className="grid gap-1.5">
              <Label>Responsável pelo pagamento</Label>
              <Select value={form.responsavel || "sem_responsavel"} onValueChange={(nome) => setForm({ ...form, responsavel: nome === "sem_responsavel" ? "" : nome ?? "" })}>
                <SelectTrigger><SelectValue placeholder="Selecione a pessoa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem_responsavel">Não definido</SelectItem>
                  {colaboradores.filter((pessoa) => pessoa.ativo).map((pessoa) => <SelectItem key={pessoa.id} value={pessoa.nome}>{pessoa.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Quem confere ou realiza este pagamento.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="data">Data</Label>
              <Input id="data" type="date" value={form.data} onChange={(event) => setForm({ ...form, data: event.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="entregas">Nº de entregas</Label>
              <Input id="entregas" type="number" min="0" value={form.numero_entregas} onChange={(event) => setForm({ ...form, numero_entregas: event.target.value })} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="taxa">Valor total de comissões (R$)</Label>
              <Input id="taxa" type="number" min="0" step="0.01" value={form.valor_taxas} onChange={(event) => setForm({ ...form, valor_taxas: event.target.value })} placeholder="0,00" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="diaria">Diária deste dia (R$)</Label>
              <Input id="diaria" type="number" min="0" step="0.01" value={form.valor_diaria} onChange={(event) => setForm({ ...form, valor_diaria: event.target.value })} placeholder="0,00" />
              <p className="text-xs text-muted-foreground">Informe o valor combinado especificamente para este dia.</p>
            </div>

            <div className="grid gap-3 rounded-lg border p-4 sm:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label>Detalhes opcionais por entrega</Label>
                  <p className="text-xs text-muted-foreground">Preencha somente os campos necessários. Nenhum detalhe é obrigatório.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setEntregasForm([...entregasForm, novaEntrega()])}><Plus className="size-4" />Adicionar entrega</Button>
              </div>
              {entregasForm.map((entrega, index) => (
                <div key={entrega.id} className="rounded-lg border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Entrega {index + 1}</p>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setEntregasForm(entregasForm.filter((item) => item.id !== entrega.id))} aria-label={`Remover entrega ${index + 1}`}><Trash2 className="size-4" /></Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Identificador #" value={entrega.identificador} onChange={(value) => setEntregasForm(entregasForm.map((item) => item.id === entrega.id ? { ...item, identificador: value } : item))} />
                    <Field label="Número da entrega" value={entrega.numero_entrega} onChange={(value) => setEntregasForm(entregasForm.map((item) => item.id === entrega.id ? { ...item, numero_entrega: value } : item))} />
                    <Field label="Bairro" value={entrega.bairro} onChange={(value) => setEntregasForm(entregasForm.map((item) => item.id === entrega.id ? { ...item, bairro: value } : item))} className="sm:col-span-2" />
                    <Field label="Recebido do cliente (R$)" type="number" value={entrega.valor_recebido} onChange={(value) => setEntregasForm(entregasForm.map((item) => item.id === entrega.id ? { ...item, valor_recebido: value } : item))} />
                    <Field label="Comissão do motoboy (R$)" type="number" value={entrega.comissao} onChange={(value) => setEntregasForm(entregasForm.map((item) => item.id === entrega.id ? { ...item, comissao: value } : item))} />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="obsm">Observação</Label>
              <Textarea id="obsm" value={form.observacao} onChange={(event) => setForm({ ...form, observacao: event.target.value })} rows={2} />
            </div>
            <PaymentAttachmentField url={form.anexo_url} path={form.anexo_path} onChange={(anexo) => setForm({ ...form, anexo_url: anexo.url, anexo_path: anexo.path })} label="Comprovante do pagamento (opcional)" previewAlt="Prévia do comprovante do pagamento" storageFolder="comprovantes" />
            <PaymentAttachmentField url={form.rastreio_anexo_url} path={form.rastreio_anexo_path} onChange={(anexo) => setForm({ ...form, rastreio_anexo_url: anexo.url, rastreio_anexo_path: anexo.path })} label="Resumo do sistema de rastreio (opcional)" helper="Print com o resumo das entregas no sistema de rastreio · JPG, PNG ou WebP · máximo 2 MB." previewAlt="Prévia do resumo do sistema de rastreio" storageFolder="rastreio" />
            <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 sm:col-span-2">
              <span className="text-sm font-semibold text-muted-foreground">Total a pagar</span>
              <span className="font-heading text-xl font-extrabold text-primary">{formatBRL(total)}</span>
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

function Field({ label, value, onChange, type = "text", className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string }) {
  return (
    <div className={`grid min-w-0 gap-1.5 ${className}`}>
      <Label>{label}</Label>
      <Input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
