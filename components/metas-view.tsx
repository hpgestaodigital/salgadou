"use client"

import { useEffect, useState } from "react"
import { History, Loader2, Pencil, Plus, Target, Trash2, TrendingUp } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { GoalProgress, formatarValorMeta, type Meta } from "@/components/goal-progress"
import { formatDate } from "@/lib/format"
import { createClient } from "@/lib/supabase/client"
import { useTable } from "@/lib/use-data"

const vazio = {
  titulo: "",
  descricao: "",
  valor_meta: "",
  unidade: "R$",
  data_inicio: "",
  prazo: "",
  status: "em_andamento",
  destaque: "laranja",
  exibir_dashboard: true,
}

type MetaLancamento = {
  id: string
  meta_id: string
  data_lancamento: string
  valor_lancado: number
  total_acumulado: number
  criado_por: string
  created_at: string
}

function hojeISO() {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = String(hoje.getMonth() + 1).padStart(2, "0")
  const dia = String(hoje.getDate()).padStart(2, "0")
  return `${ano}-${mes}-${dia}`
}

export function MetasView() {
  const supabase = createClient()
  const { data: metas, error, isLoading, mutate } = useTable<Meta>("metas", {
    column: "created_at",
    ascending: false,
  })

  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Meta | null>(null)
  const [form, setForm] = useState(vazio)
  const [salvando, setSalvando] = useState(false)

  const [historico, setHistorico] = useState<MetaLancamento[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)

  const [metaLancamento, setMetaLancamento] = useState<Meta | null>(null)
  const [valorLancamento, setValorLancamento] = useState("")
  const [dataLancamento, setDataLancamento] = useState(hojeISO)
  const [registrando, setRegistrando] = useState(false)

  useEffect(() => {
    if (error) {
      toast.error("Não foi possível carregar as metas. Aplique primeiro o SQL de Metas no Supabase.")
    }
  }, [error])

  async function carregarHistorico(metaId: string) {
    setCarregandoHistorico(true)
    const { data, error: historyError } = await supabase
      .from("meta_lancamentos")
      .select("*")
      .eq("meta_id", metaId)
      .order("data_lancamento", { ascending: false })
      .order("created_at", { ascending: false })

    setCarregandoHistorico(false)
    if (historyError) {
      setHistorico([])
      toast.error(`Não foi possível carregar o histórico: ${historyError.message}`)
      return
    }
    setHistorico((data ?? []) as MetaLancamento[])
  }

  function abrir(meta?: Meta) {
    setEditando(meta ?? null)
    setForm(
      meta
        ? {
            titulo: meta.titulo,
            descricao: meta.descricao ?? "",
            valor_meta: String(meta.valor_meta),
            unidade: meta.unidade,
            data_inicio: meta.data_inicio ?? "",
            prazo: meta.prazo ?? "",
            status: meta.status,
            destaque: meta.destaque,
            exibir_dashboard: meta.exibir_dashboard,
          }
        : vazio,
    )
    setHistorico([])
    if (meta) void carregarHistorico(meta.id)
    setAberto(true)
  }

  function abrirLancamento(meta: Meta) {
    setMetaLancamento(meta)
    setValorLancamento("")
    setDataLancamento(hojeISO())
  }

  async function salvar() {
    const alvo = Number(String(form.valor_meta).replace(",", "."))
    if (
      form.titulo.trim().length < 2 ||
      !Number.isFinite(alvo) ||
      alvo <= 0 ||
      !form.unidade.trim()
    ) {
      return toast.error("Informe título, unidade e uma meta maior que zero.")
    }
    if (form.data_inicio && form.prazo && form.prazo < form.data_inicio) {
      return toast.error("O prazo não pode ser anterior à data de início.")
    }

    setSalvando(true)
    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      valor_meta: alvo,
      unidade: form.unidade.trim(),
      data_inicio: form.data_inicio || null,
      prazo: form.prazo || null,
      status: form.status,
      destaque: form.destaque,
      exibir_dashboard: form.exibir_dashboard,
    }

    const resultado = editando
      ? await supabase
          .from("metas")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editando.id)
      : await supabase.from("metas").insert(payload)

    setSalvando(false)
    if (resultado.error) return toast.error(`Erro ao salvar: ${resultado.error.message}`)

    await mutate()
    setAberto(false)
    toast.success(editando ? "Meta atualizada." : "Meta criada.")
  }

  async function registrarLancamento() {
    if (!metaLancamento) return

    const valor = Number(valorLancamento.replace(",", "."))
    if (!Number.isFinite(valor) || valor <= 0) {
      return toast.error("Informe um valor lançado maior que zero.")
    }
    if (!dataLancamento) return toast.error("Informe a data do lançamento.")

    setRegistrando(true)
    const { error: rpcError } = await supabase.rpc("registrar_lancamento_meta", {
      p_meta_id: metaLancamento.id,
      p_valor: valor,
      p_data_lancamento: dataLancamento,
    })
    setRegistrando(false)

    if (rpcError) return toast.error(`Erro ao registrar lançamento: ${rpcError.message}`)

    await mutate()
    if (editando?.id === metaLancamento.id) await carregarHistorico(metaLancamento.id)
    setMetaLancamento(null)
    toast.success("Valor somado à meta e registrado no histórico.")
  }

  async function excluir(meta: Meta) {
    if (!window.confirm(`Excluir a meta “${meta.titulo}”? Esta ação também excluirá seu histórico.`)) return
    const { error: deleteError } = await supabase.from("metas").delete().eq("id", meta.id)
    if (deleteError) return toast.error(`Erro ao excluir: ${deleteError.message}`)
    await mutate()
    toast.success("Meta excluída.")
  }

  return (
    <div>
      <PageHeader
        title="Metas"
        description="Defina objetivos e registre cada avanço sem sobrescrever o valor acumulado."
        action={
          <Button onClick={() => abrir()}>
            <Plus className="size-4" />
            Nova meta
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando metas...</p>
      ) : metas.length === 0 ? (
        <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
          <div>
            <Target className="mx-auto size-10 text-primary" />
            <h2 className="mt-4 font-heading text-xl font-bold">Nenhuma meta definida</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Crie a primeira meta e depois registre cada valor realizado.
            </p>
            <Button className="mt-5" onClick={() => abrir()}>
              <Plus className="size-4" />
              Criar primeira meta
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metas.map((meta) => (
            <div key={meta.id} className="relative">
              <GoalProgress meta={meta} onClick={() => abrir(meta)} />
              <div className="absolute bottom-3 right-3 flex gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-primary hover:text-primary"
                  onClick={() => abrirLancamento(meta)}
                  aria-label={`Registrar avanço em ${meta.titulo}`}
                  title="Registrar avanço"
                >
                  <TrendingUp className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => abrir(meta)}
                  aria-label={`Editar ${meta.titulo}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => excluir(meta)}
                  aria-label={`Excluir ${meta.titulo}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar meta" : "Nova meta"}</DialogTitle>
            <DialogDescription>
              {editando
                ? "Edite os dados da meta sem alterar o acumulado."
                : "A nova meta começa com valor acumulado igual a zero."}
            </DialogDescription>
          </DialogHeader>

          {editando && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <div>
                <p className="text-xs text-muted-foreground">Total acumulado atual</p>
                <p className="mt-1 font-heading text-xl font-bold">
                  {formatarValorMeta(Number(editando.valor_atual), editando.unidade)}
                </p>
              </div>
              <Button type="button" onClick={() => abrirLancamento(editando)}>
                <TrendingUp className="size-4" />
                Registrar avanço
              </Button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="meta-titulo">Título</Label>
              <Input
                id="meta-titulo"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex.: Faturamento mensal"
                maxLength={120}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="meta-descricao">Descrição e critérios</Label>
              <Textarea
                id="meta-descricao"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Explique como o resultado será medido..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-alvo">Valor da meta</Label>
              <Input
                id="meta-alvo"
                inputMode="decimal"
                value={form.valor_meta}
                onChange={(e) => setForm({ ...form, valor_meta: e.target.value })}
                placeholder="Ex.: 50000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-unidade">Unidade</Label>
              <Input
                id="meta-unidade"
                value={form.unidade}
                onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                placeholder="R$, unidades, %, clientes..."
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm({ ...form, status: value ?? "em_andamento" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejada">Planejada</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="pausada">Pausada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-inicio">Início</Label>
              <Input
                id="meta-inicio"
                type="date"
                value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-prazo">Prazo</Label>
              <Input
                id="meta-prazo"
                type="date"
                value={form.prazo}
                onChange={(e) => setForm({ ...form, prazo: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor de destaque</Label>
              <Select
                value={form.destaque}
                onValueChange={(value) => setForm({ ...form, destaque: value ?? "laranja" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="laranja">Laranja</SelectItem>
                  <SelectItem value="azul">Azul</SelectItem>
                  <SelectItem value="verde">Verde</SelectItem>
                  <SelectItem value="violeta">Violeta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <Label htmlFor="meta-dashboard">Exibir no dashboard</Label>
                <p className="text-xs text-muted-foreground">Somente leitura para toda a equipe.</p>
              </div>
              <Switch
                id="meta-dashboard"
                checked={form.exibir_dashboard}
                onCheckedChange={(checked) => setForm({ ...form, exibir_dashboard: checked })}
              />
            </div>
          </div>

          {editando && (
            <div className="mt-2 space-y-3">
              <div className="flex items-center gap-2">
                <History className="size-4 text-primary" />
                <h3 className="font-semibold">Histórico da evolução</h3>
              </div>
              {carregandoHistorico ? (
                <div className="grid h-24 place-items-center rounded-xl border border-border">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : historico.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  Nenhum lançamento registrado ainda.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Valor lançado</TableHead>
                        <TableHead className="text-right">Total acumulado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{formatDate(item.data_lancamento)}</TableCell>
                          <TableCell className="text-right font-medium">
                            +{formatarValorMeta(Number(item.valor_lancado), editando.unidade)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatarValorMeta(Number(item.total_acumulado), editando.unidade)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar meta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(metaLancamento)} onOpenChange={(open) => !open && setMetaLancamento(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar avanço</DialogTitle>
            <DialogDescription>
              {metaLancamento
                ? `O valor será somado ao acumulado de “${metaLancamento.titulo}”.`
                : "Informe o novo valor realizado."}
            </DialogDescription>
          </DialogHeader>

          {metaLancamento && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">Acumulado antes do lançamento</p>
              <p className="mt-1 font-heading text-xl font-bold">
                {formatarValorMeta(Number(metaLancamento.valor_atual), metaLancamento.unidade)}
              </p>
            </div>
          )}

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="lancamento-valor">Valor realizado neste lançamento</Label>
              <Input
                id="lancamento-valor"
                inputMode="decimal"
                value={valorLancamento}
                onChange={(e) => setValorLancamento(e.target.value)}
                placeholder="Ex.: 1500"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lancamento-data">Data</Label>
              <Input
                id="lancamento-data"
                type="date"
                value={dataLancamento}
                onChange={(e) => setDataLancamento(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaLancamento(null)}>Cancelar</Button>
            <Button onClick={registrarLancamento} disabled={registrando}>
              {registrando ? "Registrando..." : "Somar ao acumulado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
