"use client"

import { useMemo, useState } from "react"
import { Bike, CheckCircle2, Loader2, Pencil, Plus, RotateCcw, Search, Send, Wallet, Package } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useTable } from "@/lib/use-data"
import type { Configuracao, Motoboy, PagamentoMotoboy } from "@/lib/types"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Filtro = "todos" | "pendentes" | "pagos"

const vazio = {
  data: todayISO(),
  motoboy_id: "",
  numero_entregas: "",
  valor_taxas: "",
  valor_diaria: "",
  observacao: "",
}

export function PagamentosMotoboys() {
  const supabase = createClient()
  const { data, isLoading, mutate } = useTable<PagamentoMotoboy>("pagamentos_motoboys", {
    column: "data",
    ascending: false,
  })
  const { data: motoboys } = useTable<Motoboy>("motoboys", { column: "nome" })
  const { data: config } = useTable<Configuracao>("configuracoes")

  const [filtro, setFiltro] = useState<Filtro>("todos")
  const [busca, setBusca] = useState("")
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<typeof vazio>(vazio)
  const [saving, setSaving] = useState(false)
  const [enviandoId, setEnviandoId] = useState<string | null>(null)

  async function enviarLembrete(p: PagamentoMotoboy) {
    const m = motoboys.find((x) => x.id === p.motoboy_id)
    const numero = m?.whatsapp
    if (!numero) {
      toast.error("Motoboy sem WhatsApp cadastrado em Cadastros.")
      return
    }
    const template =
      config.find((c) => c.chave === TEMPLATE_KEYS.motoboy)?.valor ||
      "Olá {nome}! Fechamento {data}: {entregas} entregas. Total: {total}. PIX: {pix}."
    setEnviandoId(p.id)
    try {
      await enviarWhatsapp(
        numero,
        preencherTemplate(template, {
          nome: p.motoboy_nome ?? m?.nome ?? "",
          data: formatDate(p.data),
          entregas: p.numero_entregas ?? 0,
          total: formatBRL(p.total),
          pix: p.pix ?? m?.pix ?? "",
        }),
      )
      toast.success("Lembrete enviado ao motoboy.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar.")
    } finally {
      setEnviandoId(null)
    }
  }

  const hoje = todayISO()
  const ativos = useMemo(() => motoboys.filter((m) => m.ativo), [motoboys])

  const total = useMemo(() => {
    const entregas = Number(form.numero_entregas) || 0
    const taxa = Number(form.valor_taxas) || 0
    const diaria = Number(form.valor_diaria) || 0
    return entregas * taxa + diaria
  }, [form])

  const filtrados = useMemo(() => {
    return data.filter((p) => {
      const matchBusca = !busca || (p.motoboy_nome ?? "").toLowerCase().includes(busca.toLowerCase())
      const matchFiltro =
        filtro === "todos" || (filtro === "pendentes" && !p.pago_em) || (filtro === "pagos" && !!p.pago_em)
      return matchBusca && matchFiltro
    })
  }, [data, busca, filtro])

  const totalPendente = data.filter((p) => !p.pago_em).reduce((s, p) => s + (p.total ?? 0), 0)
  const pagoMes = data
    .filter((p) => p.pago_em && p.pago_em.slice(0, 7) === hoje.slice(0, 7))
    .reduce((s, p) => s + (p.total ?? 0), 0)
  const entregasMes = data
    .filter((p) => p.data.slice(0, 7) === hoje.slice(0, 7))
    .reduce((s, p) => s + (p.numero_entregas ?? 0), 0)

  function abrirNovo() {
    setEditId(null)
    setForm(vazio)
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
    })
    setOpen(true)
  }

  function selecionarMotoboy(id: string) {
    const m = motoboys.find((mb) => mb.id === id)
    setForm((f) => ({
      ...f,
      motoboy_id: id,
      valor_diaria: f.valor_diaria || (m?.valor_diaria ? String(m.valor_diaria) : ""),
    }))
  }

  async function salvar() {
    if (!form.motoboy_id) {
      toast.error("Selecione o motoboy.")
      return
    }
    setSaving(true)
    try {
      const m = motoboys.find((mb) => mb.id === form.motoboy_id)
      const payload = {
        data: form.data,
        motoboy_id: form.motoboy_id,
        motoboy_nome: m?.nome ?? null,
        pix: m?.pix ?? null,
        numero_entregas: Number(form.numero_entregas) || 0,
        valor_taxas: Number(form.valor_taxas) || 0,
        valor_diaria: Number(form.valor_diaria) || 0,
        total,
        observacao: form.observacao || null,
      }
      const { error } = editId
        ? await supabase.from("pagamentos_motoboys").update(payload).eq("id", editId)
        : await supabase.from("pagamentos_motoboys").insert(payload)
      if (error) throw error
      toast.success(editId ? "Pagamento atualizado." : "Pagamento adicionado.")
      setOpen(false)
      mutate()
    } catch (e) {
      console.log("[v0] erro salvar motoboy:", e)
      toast.error("Erro ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  async function alternarPago(p: PagamentoMotoboy) {
    const novo = p.pago_em ? null : todayISO()
    const { error } = await supabase.from("pagamentos_motoboys").update({ pago_em: novo }).eq("id", p.id)
    if (error) {
      toast.error("Erro ao atualizar.")
      return
    }
    toast.success(novo ? "Marcado como pago." : "Reaberto.")
    mutate()
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("pagamentos_motoboys").delete().eq("id", id)
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
        title="Pagamentos de Motoboys"
        description="Registre entregas, taxas e diárias. O total é calculado automaticamente."
        action={
          <Button onClick={abrirNovo}>
            <Plus className="size-4" />
            Novo pagamento
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-6">
        <StatCard label="A pagar (total)" value={formatBRL(totalPendente)} icon={Bike} tone="warning" />
        <StatCard label="Pago no mês" value={formatBRL(pagoMes)} icon={Wallet} tone="success" />
        <StatCard label="Entregas no mês" value={`${entregasMes}`} icon={Package} tone="primary" />
      </div>

      <Card className="p-4 mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar motoboy"
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
                <TableHead>Data</TableHead>
                <TableHead>Motoboy</TableHead>
                <TableHead className="text-center">Entregas</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">Diária</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Nenhum pagamento encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtrados.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.data)}</TableCell>
                    <TableCell className="font-semibold">
                      {p.motoboy_nome ?? "—"}
                      {p.pix && (
                        <span className="block text-xs font-normal text-muted-foreground truncate max-w-40">
                          PIX: {p.pix}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{p.numero_entregas ?? 0}</TableCell>
                    <TableCell className="text-right">{formatBRL(p.valor_taxas)}</TableCell>
                    <TableCell className="text-right">{formatBRL(p.valor_diaria)}</TableCell>
                    <TableCell className="text-right font-heading font-bold">{formatBRL(p.total)}</TableCell>
                    <TableCell>
                      {p.pago_em ? (
                        <Badge className="bg-accent text-accent-foreground">Pago {formatDate(p.pago_em)}</Badge>
                      ) : (
                        <Badge variant="secondary">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
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
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar pagamento" : "Novo pagamento de motoboy"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Motoboy</Label>
              <Select value={form.motoboy_id} onValueChange={selecionarMotoboy}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motoboy" />
                </SelectTrigger>
                <SelectContent>
                  {ativos.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Cadastre motoboys primeiro
                    </SelectItem>
                  ) : (
                    ativos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="data">Data</Label>
              <Input
                id="data"
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="entregas">Nº de entregas</Label>
              <Input
                id="entregas"
                type="number"
                value={form.numero_entregas}
                onChange={(e) => setForm({ ...form, numero_entregas: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="taxa">Valor por entrega (R$)</Label>
              <Input
                id="taxa"
                type="number"
                step="0.01"
                value={form.valor_taxas}
                onChange={(e) => setForm({ ...form, valor_taxas: e.target.value })}
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="diaria">Diária (R$)</Label>
              <Input
                id="diaria"
                type="number"
                step="0.01"
                value={form.valor_diaria}
                onChange={(e) => setForm({ ...form, valor_diaria: e.target.value })}
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="obsm">Observação</Label>
              <Textarea
                id="obsm"
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                rows={2}
              />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-lg bg-muted px-4 py-3">
              <span className="text-sm font-semibold text-muted-foreground">Total a pagar</span>
              <span className="font-heading text-xl font-extrabold text-primary">{formatBRL(total)}</span>
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
