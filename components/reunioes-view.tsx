"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Users,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mensagemErroSupabase } from "@/lib/supabase/friendly-error"
import { useTable } from "@/lib/use-data"
import type { Colaborador } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { ConfirmDeleteButton } from "@/components/confirm-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type StatusItem = "nao_realizado" | "em_andamento" | "concluido"
type Prioridade = "baixa" | "media" | "alta"
type StatusReuniao = "agendada" | "realizada" | "cancelada"
type FiltroReuniao = "agendadas" | "realizadas" | "canceladas" | "todas"

type Reuniao = {
  id: string
  titulo: string
  inicio: string
  fim: string | null
  status: StatusReuniao
  participante_ids: string[]
  participante_nomes: string[]
  pauta: string | null
  resumo: string | null
  local: string | null
  link: string | null
  motivo_cancelamento: string | null
  transcricao: string | null
  transcricao_fonte: string | null
  created_at: string
}

type Item = {
  id: string
  reuniao_id: string
  descricao: string
  responsavel_id: string | null
  responsavel_nome: string | null
  prazo: string | null
  prioridade: Prioridade
  status: StatusItem
  created_at: string
}

const STATUS_ITEM: Record<StatusItem, string> = {
  nao_realizado: "Não realizado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
}
const PRIORIDADE: Record<Prioridade, string> = { baixa: "Baixa", media: "Média", alta: "Alta" }
const STATUS_REUNIAO: Record<StatusReuniao, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
}
const itemVazio = {
  descricao: "",
  responsavel_id: "",
  prazo: "",
  prioridade: "media" as Prioridade,
  status: "nao_realizado" as StatusItem,
}

function localDateTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function horarioInicial() {
  const inicio = new Date()
  inicio.setMinutes(0, 0, 0)
  inicio.setHours(inicio.getHours() + 1)
  return inicio
}

function formularioVazio(status: StatusReuniao) {
  const inicio = horarioInicial()
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000)
  return {
    titulo: "",
    inicio: localDateTime(inicio.toISOString()),
    fim: localDateTime(fim.toISOString()),
    participante_ids: [] as string[],
    pauta: "",
    resumo: "",
    local: "",
    link: "",
    status,
  }
}

function intervaloReuniao(reuniao: Reuniao) {
  const inicio = new Date(reuniao.inicio)
  const data = inicio.toLocaleDateString("pt-BR", { dateStyle: "long" })
  const horaInicio = inicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  const horaFim = reuniao.fim
    ? new Date(reuniao.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null
  return `${data}, ${horaInicio}${horaFim ? `–${horaFim}` : ""}`
}

export function ReunioesView() {
  const supabase = createClient()
  const { data: reunioes, error, mutate: mutateReunioes } = useTable<Reuniao>("reunioes", {
    column: "inicio",
    ascending: false,
  })
  const { data: itens, mutate: mutateItens } = useTable<Item>("reunioes_itens", { column: "created_at" })
  const { data: pessoas } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const ativos = pessoas.filter((p) => p.ativo)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [filtroReuniao, setFiltroReuniao] = useState<FiltroReuniao>("agendadas")
  const [filtroItem, setFiltroItem] = useState<"todos" | StatusItem>("todos")
  const [dialogReuniao, setDialogReuniao] = useState(false)
  const [dialogItem, setDialogItem] = useState(false)
  const [dialogTranscricao, setDialogTranscricao] = useState(false)
  const [editReuniao, setEditReuniao] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<string | null>(null)
  const [formReuniao, setFormReuniao] = useState(() => formularioVazio("agendada"))
  const [formItem, setFormItem] = useState(itemVazio)
  const [formTranscricao, setFormTranscricao] = useState({ fonte: "", transcricao: "", resumo: "" })
  const [saving, setSaving] = useState(false)

  const reunioesVisiveis = useMemo(() => {
    const filtradas = reunioes.filter((reuniao) => {
      if (filtroReuniao === "agendadas") return reuniao.status === "agendada"
      if (filtroReuniao === "realizadas") return reuniao.status === "realizada"
      if (filtroReuniao === "canceladas") return reuniao.status === "cancelada"
      return true
    })
    return [...filtradas].sort((a, b) => {
      if (filtroReuniao === "agendadas") return a.inicio.localeCompare(b.inicio)
      return b.inicio.localeCompare(a.inicio)
    })
  }, [reunioes, filtroReuniao])

  useEffect(() => {
    if (!selecionada && reunioesVisiveis[0]) setSelecionada(reunioesVisiveis[0].id)
    if (selecionada && !reunioesVisiveis.some((r) => r.id === selecionada)) {
      setSelecionada(reunioesVisiveis[0]?.id ?? null)
    }
  }, [reunioesVisiveis, selecionada])

  const reuniao = reunioes.find((r) => r.id === selecionada) ?? null
  const itensDaReuniao = useMemo(
    () => itens.filter((i) => i.reuniao_id === selecionada && (filtroItem === "todos" || i.status === filtroItem)),
    [itens, selecionada, filtroItem],
  )

  function novaReuniao(status: StatusReuniao) {
    setEditReuniao(null)
    setFormReuniao(formularioVazio(status))
    setDialogReuniao(true)
  }

  function editarReuniao(reuniaoAtual: Reuniao) {
    const fim = reuniaoAtual.fim
      ? localDateTime(reuniaoAtual.fim)
      : localDateTime(new Date(new Date(reuniaoAtual.inicio).getTime() + 60 * 60 * 1000).toISOString())
    setEditReuniao(reuniaoAtual.id)
    setFormReuniao({
      titulo: reuniaoAtual.titulo,
      inicio: localDateTime(reuniaoAtual.inicio),
      fim,
      participante_ids: reuniaoAtual.participante_ids ?? [],
      pauta: reuniaoAtual.pauta ?? "",
      resumo: reuniaoAtual.resumo ?? "",
      local: reuniaoAtual.local ?? "",
      link: reuniaoAtual.link ?? "",
      status: reuniaoAtual.status,
    })
    setDialogReuniao(true)
  }

  function novoItem() {
    setEditItem(null)
    setFormItem(itemVazio)
    setDialogItem(true)
  }

  function importarTranscricao() {
    if (!reuniao) return
    setFormTranscricao({
      fonte: reuniao.transcricao_fonte ?? "",
      transcricao: reuniao.transcricao ?? "",
      resumo: reuniao.resumo ?? "",
    })
    setDialogTranscricao(true)
  }

  function editarItem(item: Item) {
    setEditItem(item.id)
    setFormItem({
      descricao: item.descricao,
      responsavel_id: item.responsavel_id ?? "",
      prazo: item.prazo ?? "",
      prioridade: item.prioridade,
      status: item.status,
    })
    setDialogItem(true)
  }

  async function salvarReuniao() {
    if (!formReuniao.titulo.trim() || !formReuniao.inicio || !formReuniao.fim) {
      return toast.error("Informe título, início e término da reunião.")
    }
    const inicio = new Date(formReuniao.inicio)
    const fim = new Date(formReuniao.fim)
    if (fim <= inicio) return toast.error("O término precisa ser posterior ao início.")
    if (formReuniao.status === "agendada" && formReuniao.participante_ids.length === 0) {
      return toast.error("Marque pelo menos um participante para a reunião aparecer na agenda dele.")
    }

    setSaving(true)
    const selecionados = ativos.filter((p) => formReuniao.participante_ids.includes(p.id))
    const payload = {
      titulo: formReuniao.titulo.trim(),
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      status: formReuniao.status,
      participante_ids: selecionados.map((p) => p.id),
      participante_nomes: selecionados.map((p) => p.nome),
      pauta: formReuniao.pauta.trim() || null,
      resumo: formReuniao.status === "realizada" ? formReuniao.resumo.trim() || null : null,
      local: formReuniao.local.trim() || null,
      link: formReuniao.link.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const result = editReuniao
      ? await supabase.from("reunioes").update(payload).eq("id", editReuniao).select("id").single()
      : await supabase.from("reunioes").insert(payload).select("id").single()
    setSaving(false)
    if (result.error) {
      return toast.error(mensagemErroSupabase(result.error, "Não foi possível salvar a reunião."))
    }

    setSelecionada(result.data.id)
    setFiltroReuniao(formReuniao.status === "agendada" ? "agendadas" : "realizadas")
    setDialogReuniao(false)
    mutateReunioes()
    toast.success(
      editReuniao
        ? "Reunião atualizada."
        : formReuniao.status === "agendada"
          ? "Reunião agendada e incluída na agenda dos participantes."
          : "Reunião realizada registrada.",
    )
  }

  async function marcarComoRealizada(reuniaoAtual: Reuniao) {
    setSaving(true)
    const { error: updateError } = await supabase
      .from("reunioes")
      .update({ status: "realizada", realizada_em: new Date().toISOString() })
      .eq("id", reuniaoAtual.id)
    setSaving(false)
    if (updateError) return toast.error("Não foi possível marcar a reunião como realizada.")
    setFiltroReuniao("realizadas")
    setSelecionada(reuniaoAtual.id)
    mutateReunioes()
    toast.success("Reunião marcada como realizada. A ata e o backlog estão liberados.")
  }

  async function cancelarReuniao(reuniaoAtual: Reuniao) {
    const motivo = window.prompt("Motivo do cancelamento:")
    if (motivo === null) return
    if (!motivo.trim()) return toast.error("Informe o motivo do cancelamento.")
    const { error: updateError } = await supabase
      .from("reunioes")
      .update({ status: "cancelada", motivo_cancelamento: motivo.trim() })
      .eq("id", reuniaoAtual.id)
    if (updateError) return toast.error("Não foi possível cancelar a reunião.")
    setFiltroReuniao("canceladas")
    setSelecionada(reuniaoAtual.id)
    mutateReunioes()
    toast.success("Reunião cancelada e removida das agendas.")
  }

  async function reagendarReuniao(reuniaoAtual: Reuniao) {
    const { error: updateError } = await supabase
      .from("reunioes")
      .update({ status: "agendada" })
      .eq("id", reuniaoAtual.id)
    if (updateError) return toast.error("Não foi possível reabrir o agendamento.")
    setFiltroReuniao("agendadas")
    setSelecionada(reuniaoAtual.id)
    mutateReunioes()
    toast.success("Agendamento reaberto. Revise a data e os participantes.")
  }

  async function salvarItem() {
    if (!selecionada || !formItem.descricao.trim()) return toast.error("Descreva o item do backlog.")
    setSaving(true)
    const pessoa = ativos.find((p) => p.id === formItem.responsavel_id)
    const payload = {
      reuniao_id: selecionada,
      descricao: formItem.descricao.trim(),
      responsavel_id: pessoa?.id ?? null,
      responsavel_nome: pessoa?.nome ?? null,
      prazo: formItem.prazo || null,
      prioridade: formItem.prioridade,
      status: formItem.status,
      updated_at: new Date().toISOString(),
    }
    const { error: itemError } = editItem
      ? await supabase.from("reunioes_itens").update(payload).eq("id", editItem)
      : await supabase.from("reunioes_itens").insert(payload)
    setSaving(false)
    if (itemError) return toast.error(mensagemErroSupabase(itemError, "Não foi possível salvar o item."))
    setDialogItem(false)
    mutateItens()
    toast.success(editItem ? "Item atualizado." : "Item adicionado ao backlog.")
  }

  async function salvarTranscricao() {
    if (!reuniao || !formTranscricao.transcricao.trim()) return toast.error("Cole a transcrição original da reunião.")
    setSaving(true)
    const { error: transcricaoError } = await supabase
      .from("reunioes")
      .update({
        transcricao: formTranscricao.transcricao.trim(),
        transcricao_fonte: formTranscricao.fonte.trim() || null,
        resumo: formTranscricao.resumo.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reuniao.id)
    setSaving(false)
    if (transcricaoError) return toast.error("Não foi possível importar a transcrição.")
    setDialogTranscricao(false)
    mutateReunioes()
    toast.success("Transcrição e ata atualizadas.")
  }

  async function excluirReuniao(id: string) {
    const { error: deleteError } = await supabase.from("reunioes").delete().eq("id", id)
    if (deleteError) return toast.error("Não foi possível excluir a reunião.")
    mutateReunioes()
    mutateItens()
    toast.success("Reunião excluída.")
  }

  async function excluirItem(id: string) {
    const { error: deleteError } = await supabase.from("reunioes_itens").delete().eq("id", id)
    if (deleteError) return toast.error("Não foi possível excluir o item.")
    mutateItens()
    toast.success("Item excluído.")
  }

  return (
    <div>
      <PageHeader
        title="Reuniões"
        description="Agende encontros, defina participantes e transforme reuniões realizadas em atas e ações."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => novaReuniao("realizada")}>
              <FileText className="size-4" />Registrar ata
            </Button>
            <Button onClick={() => novaReuniao("agendada")}>
              <CalendarClock className="size-4" />Agendar reunião
            </Button>
          </div>
        }
      />

      {error && (
        <Card className="mb-5 border-destructive/40">
          <CardContent className="py-5 text-sm">Não foi possível carregar as reuniões.</CardContent>
        </Card>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {([
          ["agendadas", "Agendadas"],
          ["realizadas", "Realizadas"],
          ["canceladas", "Canceladas"],
          ["todas", "Todas"],
        ] as const).map(([valor, label]) => (
          <Button
            key={valor}
            size="sm"
            variant={filtroReuniao === valor ? "default" : "outline"}
            onClick={() => setFiltroReuniao(valor)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
        <div className="space-y-3">
          {reunioesVisiveis.length === 0 && !error && (
            <Card>
              <CardContent className="py-10 text-center">
                <CalendarClock className="mx-auto mb-3 size-8 text-muted-foreground" />
                <p className="font-semibold">Nenhuma reunião neste filtro</p>
                <p className="mt-1 text-sm text-muted-foreground">Agende uma reunião ou consulte outro status.</p>
              </CardContent>
            </Card>
          )}
          {reunioesVisiveis.map((item) => {
            const pendentes = itens.filter((acao) => acao.reuniao_id === item.id && acao.status !== "concluido").length
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelecionada(item.id)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  item.id === selecionada
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-card hover:bg-muted/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{item.titulo}</p>
                  <Badge variant={item.status === "cancelada" ? "destructive" : item.status === "agendada" ? "default" : "secondary"}>
                    {STATUS_REUNIAO[item.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{intervaloReuniao(item)}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Users className="size-3.5" />{item.participante_nomes?.length ?? 0} participantes
                  </span>
                  {item.status === "realizada" && <Badge variant={pendentes ? "secondary" : "outline"}>{pendentes} pendentes</Badge>}
                </div>
              </button>
            )
          })}
        </div>

        {reuniao ? (
          <div className="space-y-5">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{reuniao.titulo}</CardTitle>
                    <Badge variant={reuniao.status === "cancelada" ? "destructive" : reuniao.status === "agendada" ? "default" : "secondary"}>
                      {STATUS_REUNIAO[reuniao.status]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{intervaloReuniao(reuniao)}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => editarReuniao(reuniao)} aria-label="Editar reunião">
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmDeleteButton onConfirm={() => excluirReuniao(reuniao.id)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Participantes</p>
                  <p className="mt-1 text-sm">{reuniao.participante_nomes?.join(", ") || "Nenhum participante selecionado"}</p>
                </div>

                {(reuniao.local || reuniao.link) && (
                  <div className="flex flex-wrap gap-3 text-sm">
                    {reuniao.local && <span className="flex items-center gap-1.5"><MapPin className="size-4 text-primary" />{reuniao.local}</span>}
                    {reuniao.link && (
                      <a href={reuniao.link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                        <ExternalLink className="size-4" />Abrir link da reunião
                      </a>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pauta</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{reuniao.pauta || "Pauta não informada."}</p>
                </div>

                {reuniao.status === "agendada" && (
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button onClick={() => marcarComoRealizada(reuniao)} disabled={saving}>
                      <CalendarCheck2 className="size-4" />Marcar como realizada
                    </Button>
                    <Button variant="outline" onClick={() => cancelarReuniao(reuniao)}>
                      <XCircle className="size-4" />Cancelar reunião
                    </Button>
                  </div>
                )}

                {reuniao.status === "cancelada" && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                    <p><strong>Motivo:</strong> {reuniao.motivo_cancelamento || "Não informado"}</p>
                    <Button className="mt-3" variant="outline" onClick={() => reagendarReuniao(reuniao)}>
                      <RotateCcw className="size-4" />Reabrir agendamento
                    </Button>
                  </div>
                )}

                {reuniao.status === "realizada" && (
                  <>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ata e resumo</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{reuniao.resumo || "Ata ainda não preenchida."}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                      <div>
                        <p className="text-sm font-medium">Transcrição externa</p>
                        <p className="text-xs text-muted-foreground">Cole a transcrição gerada pelo aplicativo utilizado na reunião.</p>
                      </div>
                      <Button variant="outline" onClick={importarTranscricao}>
                        <FileText className="size-4" />{reuniao.transcricao ? "Editar transcrição" : "Importar transcrição"}
                      </Button>
                    </div>
                    {reuniao.transcricao && (
                      <div className="rounded-lg border bg-muted/25 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transcrição original</p>
                          {reuniao.transcricao_fonte && <Badge variant="outline">Fonte: {reuniao.transcricao_fonte}</Badge>}
                        </div>
                        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{reuniao.transcricao}</div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {reuniao.status === "realizada" ? (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-heading text-xl font-bold">Backlog da reunião</h2>
                    <p className="text-sm text-muted-foreground">Ações, responsáveis e prazos definidos na ata.</p>
                  </div>
                  <Button onClick={novoItem}><Plus className="size-4" />Adicionar item</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["todos", "nao_realizado", "em_andamento", "concluido"] as const).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={filtroItem === status ? "default" : "outline"}
                      onClick={() => setFiltroItem(status)}
                    >
                      {status === "todos" ? "Todos" : STATUS_ITEM[status]}
                    </Button>
                  ))}
                </div>
                {itensDaReuniao.length === 0 ? (
                  <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum item neste filtro.</CardContent></Card>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {itensDaReuniao.map((item) => (
                      <Card key={item.id}>
                        <CardContent className="pt-5">
                          <div className="flex items-start justify-between gap-3">
                            <StatusIcon status={item.status} />
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => editarItem(item)} aria-label="Editar item">
                                <Pencil className="size-4" />
                              </Button>
                              <ConfirmDeleteButton onConfirm={() => excluirItem(item.id)} />
                            </div>
                          </div>
                          <p className="mt-3 font-medium">{item.descricao}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Badge variant="outline">{STATUS_ITEM[item.status]}</Badge>
                            <Badge
                              className={item.prioridade === "alta" ? "bg-destructive text-destructive-foreground" : ""}
                              variant={item.prioridade === "alta" ? "default" : "secondary"}
                            >
                              {PRIORIDADE[item.prioridade]}
                            </Badge>
                          </div>
                          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                            <p>Responsável: {item.responsavel_nome || "Não definido"}</p>
                            <p>Prazo: {item.prazo ? new Date(`${item.prazo}T12:00:00`).toLocaleDateString("pt-BR") : "Sem prazo"}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  A ata, a transcrição e o backlog serão liberados quando a reunião for marcada como realizada.
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card><CardContent className="grid min-h-64 place-items-center text-sm text-muted-foreground">Selecione uma reunião.</CardContent></Card>
        )}
      </div>

      <Dialog open={dialogReuniao} onOpenChange={setDialogReuniao}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editReuniao
                ? "Editar reunião"
                : formReuniao.status === "agendada"
                  ? "Agendar reunião"
                  : "Registrar reunião realizada"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Título</Label>
              <Input
                value={formReuniao.titulo}
                onChange={(e) => setFormReuniao({ ...formReuniao, titulo: e.target.value })}
                placeholder="Ex.: Planejamento da semana"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Início</Label>
                <Input type="datetime-local" value={formReuniao.inicio} onChange={(e) => setFormReuniao({ ...formReuniao, inicio: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Término</Label>
                <Input type="datetime-local" value={formReuniao.fim} onChange={(e) => setFormReuniao({ ...formReuniao, fim: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Local ou sala</Label>
                <Input value={formReuniao.local} onChange={(e) => setFormReuniao({ ...formReuniao, local: e.target.value })} placeholder="Ex.: Escritório" />
              </div>
              <div className="grid gap-1.5">
                <Label>Link da reunião</Label>
                <Input type="url" value={formReuniao.link} onChange={(e) => setFormReuniao({ ...formReuniao, link: e.target.value })} placeholder="https://..." />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Participantes {formReuniao.status === "agendada" && "(obrigatório)"}</Label>
              <div className="grid max-h-40 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
                {ativos.map((pessoa) => (
                  <label key={pessoa.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formReuniao.participante_ids.includes(pessoa.id)}
                      onChange={(e) =>
                        setFormReuniao({
                          ...formReuniao,
                          participante_ids: e.target.checked
                            ? [...formReuniao.participante_ids, pessoa.id]
                            : formReuniao.participante_ids.filter((id) => id !== pessoa.id),
                        })
                      }
                    />
                    {pessoa.nome}
                  </label>
                ))}
                {ativos.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pessoa ativa cadastrada.</p>}
              </div>
              {formReuniao.status === "agendada" && (
                <p className="text-xs text-muted-foreground">A reunião aparecerá no calendário da Dashboard dos participantes que possuem usuário vinculado.</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Pauta</Label>
              <Textarea
                rows={4}
                value={formReuniao.pauta}
                onChange={(e) => setFormReuniao({ ...formReuniao, pauta: e.target.value })}
                placeholder="Assuntos e objetivos da reunião"
              />
            </div>
            {formReuniao.status === "realizada" && (
              <div className="grid gap-1.5">
                <Label>Ata e resumo</Label>
                <Textarea
                  rows={5}
                  value={formReuniao.resumo}
                  onChange={(e) => setFormReuniao({ ...formReuniao, resumo: e.target.value })}
                  placeholder="Decisões, contexto e observações da reunião"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogReuniao(false)}>Cancelar</Button>
            <Button onClick={salvarReuniao} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {formReuniao.status === "agendada" ? "Salvar agendamento" : "Salvar reunião"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogItem} onOpenChange={setDialogItem}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Editar item" : "Novo item do backlog"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Textarea value={formItem.descricao} onChange={(e) => setFormItem({ ...formItem, descricao: e.target.value })} placeholder="O que precisa ser feito?" />
            </div>
            <div className="grid gap-1.5">
              <Label>Responsável</Label>
              <Select value={formItem.responsavel_id || "sem_responsavel"} onValueChange={(v) => setFormItem({ ...formItem, responsavel_id: v === "sem_responsavel" ? "" : v ?? "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem_responsavel">Não definido</SelectItem>
                  {ativos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Prazo</Label>
                <Input type="date" value={formItem.prazo} onChange={(e) => setFormItem({ ...formItem, prazo: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Prioridade</Label>
                <Select value={formItem.prioridade} onValueChange={(v) => setFormItem({ ...formItem, prioridade: v as Prioridade })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PRIORIDADE).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={formItem.status} onValueChange={(v) => setFormItem({ ...formItem, status: v as StatusItem })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS_ITEM).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogItem(false)}>Cancelar</Button>
            <Button onClick={salvarItem} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Salvar item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogTranscricao} onOpenChange={setDialogTranscricao}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Importar transcrição</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Cole abaixo a transcrição gerada pelo aplicativo externo utilizado na reunião.</p>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Fonte ou aplicativo (opcional)</Label>
              <Input value={formTranscricao.fonte} onChange={(e) => setFormTranscricao({ ...formTranscricao, fonte: e.target.value })} placeholder="Ex.: Google Meet, Tactiq, Notta" />
            </div>
            <div className="grid gap-1.5">
              <Label>Transcrição original</Label>
              <Textarea rows={10} value={formTranscricao.transcricao} onChange={(e) => setFormTranscricao({ ...formTranscricao, transcricao: e.target.value })} placeholder="Cole aqui o texto completo da transcrição" />
            </div>
            <div className="grid gap-1.5">
              <Label>Ata e resumo editável</Label>
              <Textarea rows={4} value={formTranscricao.resumo} onChange={(e) => setFormTranscricao({ ...formTranscricao, resumo: e.target.value })} placeholder="Decisões e principais pontos" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogTranscricao(false)}>Cancelar</Button>
            <Button onClick={salvarTranscricao} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Salvar transcrição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusIcon({ status }: { status: StatusItem }) {
  if (status === "concluido") return <CheckCircle2 className="size-5 text-emerald-500" />
  if (status === "em_andamento") return <Clock3 className="size-5 text-primary" />
  return <CircleDashed className="size-5 text-muted-foreground" />
}
