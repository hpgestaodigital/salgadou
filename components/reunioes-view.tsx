"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, CircleDashed, Clock3, FileText, Loader2, Pencil, Plus, Users } from "lucide-react"
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

type Status = "nao_realizado" | "em_andamento" | "concluido"
type Prioridade = "baixa" | "media" | "alta"
type Reuniao = { id: string; titulo: string; inicio: string; participante_ids: string[]; participante_nomes: string[]; resumo: string | null; transcricao: string | null; transcricao_fonte: string | null; created_at: string }
type Item = { id: string; reuniao_id: string; descricao: string; responsavel_id: string | null; responsavel_nome: string | null; prazo: string | null; prioridade: Prioridade; status: Status; created_at: string }

const STATUS: Record<Status, string> = { nao_realizado: "Não realizado", em_andamento: "Em andamento", concluido: "Concluído" }
const PRIORIDADE: Record<Prioridade, string> = { baixa: "Baixa", media: "Média", alta: "Alta" }
const reuniaoVazia = { titulo: "", inicio: "", participante_ids: [] as string[], resumo: "" }
const itemVazio = { descricao: "", responsavel_id: "", prazo: "", prioridade: "media" as Prioridade, status: "nao_realizado" as Status }

function localDateTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ReunioesView() {
  const supabase = createClient()
  const { data: reunioes, error, mutate: mutateReunioes } = useTable<Reuniao>("reunioes", { column: "inicio", ascending: false })
  const { data: itens, mutate: mutateItens } = useTable<Item>("reunioes_itens", { column: "created_at" })
  const { data: pessoas } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const ativos = pessoas.filter((p) => p.ativo)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<"todos" | Status>("todos")
  const [dialogReuniao, setDialogReuniao] = useState(false)
  const [dialogItem, setDialogItem] = useState(false)
  const [dialogTranscricao, setDialogTranscricao] = useState(false)
  const [editReuniao, setEditReuniao] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<string | null>(null)
  const [formReuniao, setFormReuniao] = useState(reuniaoVazia)
  const [formItem, setFormItem] = useState(itemVazio)
  const [formTranscricao, setFormTranscricao] = useState({ fonte: "", transcricao: "", resumo: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!selecionada && reunioes[0]) setSelecionada(reunioes[0].id)
    if (selecionada && !reunioes.some((r) => r.id === selecionada)) setSelecionada(reunioes[0]?.id ?? null)
  }, [reunioes, selecionada])

  const reuniao = reunioes.find((r) => r.id === selecionada) ?? null
  const itensDaReuniao = useMemo(() => itens.filter((i) => i.reuniao_id === selecionada && (filtro === "todos" || i.status === filtro)), [itens, selecionada, filtro])

  function novaReuniao() {
    setEditReuniao(null)
    setFormReuniao({ ...reuniaoVazia, inicio: localDateTime(new Date().toISOString()) })
    setDialogReuniao(true)
  }
  function editarReuniao(r: Reuniao) {
    setEditReuniao(r.id)
    setFormReuniao({ titulo: r.titulo, inicio: localDateTime(r.inicio), participante_ids: r.participante_ids ?? [], resumo: r.resumo ?? "" })
    setDialogReuniao(true)
  }
  function novoItem() { setEditItem(null); setFormItem(itemVazio); setDialogItem(true) }
  function importarTranscricao() {
    if (!reuniao) return
    setFormTranscricao({ fonte: reuniao.transcricao_fonte ?? "", transcricao: reuniao.transcricao ?? "", resumo: reuniao.resumo ?? "" })
    setDialogTranscricao(true)
  }
  function editarItem(i: Item) {
    setEditItem(i.id)
    setFormItem({ descricao: i.descricao, responsavel_id: i.responsavel_id ?? "", prazo: i.prazo ?? "", prioridade: i.prioridade, status: i.status })
    setDialogItem(true)
  }

  async function salvarReuniao() {
    if (!formReuniao.titulo.trim() || !formReuniao.inicio) return toast.error("Informe o título e a data da reunião.")
    setSaving(true)
    const selecionados = ativos.filter((p) => formReuniao.participante_ids.includes(p.id))
    const payload = { titulo: formReuniao.titulo.trim(), inicio: new Date(formReuniao.inicio).toISOString(), participante_ids: selecionados.map((p) => p.id), participante_nomes: selecionados.map((p) => p.nome), resumo: formReuniao.resumo.trim() || null, updated_at: new Date().toISOString() }
    const result = editReuniao ? await supabase.from("reunioes").update(payload).eq("id", editReuniao).select("id").single() : await supabase.from("reunioes").insert(payload).select("id").single()
    setSaving(false)
    if (result.error) return toast.error(mensagemErroSupabase(result.error, "Não foi possível salvar a reunião. Aplique a migração indicada."))
    setSelecionada(result.data.id); setDialogReuniao(false); mutateReunioes(); toast.success(editReuniao ? "Reunião atualizada." : "Reunião criada.")
  }

  async function salvarItem() {
    if (!selecionada || !formItem.descricao.trim()) return toast.error("Descreva o item do backlog.")
    setSaving(true)
    const pessoa = ativos.find((p) => p.id === formItem.responsavel_id)
    const payload = { reuniao_id: selecionada, descricao: formItem.descricao.trim(), responsavel_id: pessoa?.id ?? null, responsavel_nome: pessoa?.nome ?? null, prazo: formItem.prazo || null, prioridade: formItem.prioridade, status: formItem.status, updated_at: new Date().toISOString() }
    const { error } = editItem ? await supabase.from("reunioes_itens").update(payload).eq("id", editItem) : await supabase.from("reunioes_itens").insert(payload)
    setSaving(false)
    if (error) return toast.error(mensagemErroSupabase(error, "Não foi possível salvar o item."))
    setDialogItem(false); mutateItens(); toast.success(editItem ? "Item atualizado." : "Item adicionado ao backlog.")
  }

  async function salvarTranscricao() {
    if (!reuniao || !formTranscricao.transcricao.trim()) return toast.error("Cole a transcrição original da reunião.")
    setSaving(true)
    const { error } = await supabase.from("reunioes").update({
      transcricao: formTranscricao.transcricao.trim(),
      transcricao_fonte: formTranscricao.fonte.trim() || null,
      resumo: formTranscricao.resumo.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", reuniao.id)
    setSaving(false)
    if (error) return toast.error(mensagemErroSupabase(error, "Não foi possível importar. Aplique a migração de transcrições."))
    setDialogTranscricao(false); mutateReunioes(); toast.success("Transcrição importada.")
  }

  async function excluirReuniao(id: string) {
    const { error } = await supabase.from("reunioes").delete().eq("id", id)
    if (error) return toast.error("Não foi possível excluir a reunião.")
    mutateReunioes(); mutateItens(); toast.success("Reunião excluída.")
  }
  async function excluirItem(id: string) {
    const { error } = await supabase.from("reunioes_itens").delete().eq("id", id)
    if (error) return toast.error("Não foi possível excluir o item.")
    mutateItens(); toast.success("Item excluído.")
  }

  return <div>
    <PageHeader title="Reuniões" description="Registre encontros, decisões e acompanhe cada ação do backlog." action={<Button onClick={novaReuniao}><Plus className="size-4" />Nova reunião</Button>} />
    {error && <Card className="mb-5 border-destructive/40"><CardContent className="py-5 text-sm">A área ainda precisa da migração <strong>20260731100000_meeting_backlog.sql</strong> no Supabase.</CardContent></Card>}
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">
        {reunioes.length === 0 && !error && <Card><CardContent className="py-10 text-center"><CalendarClock className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-semibold">Nenhuma reunião registrada</p><p className="mt-1 text-sm text-muted-foreground">Crie a primeira reunião para organizar a pauta e as ações.</p></CardContent></Card>}
        {reunioes.map((r) => {
          const pendentes = itens.filter((i) => i.reuniao_id === r.id && i.status !== "concluido").length
          return <button key={r.id} onClick={() => setSelecionada(r.id)} className={`w-full rounded-xl border p-4 text-left transition-colors ${r.id === selecionada ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:bg-muted/50"}`}>
            <p className="font-semibold">{r.titulo}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(r.inicio).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
            <div className="mt-3 flex items-center justify-between text-xs"><span className="flex items-center gap-1 text-muted-foreground"><Users className="size-3.5" />{r.participante_nomes?.length ?? 0} participantes</span><Badge variant={pendentes ? "secondary" : "outline"}>{pendentes} pendentes</Badge></div>
          </button>
        })}
      </div>
      {reuniao ? <div className="space-y-5">
        <Card><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>{reuniao.titulo}</CardTitle><p className="mt-2 text-sm text-muted-foreground">{new Date(reuniao.inicio).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}</p></div><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => editarReuniao(reuniao)} aria-label="Editar reunião"><Pencil className="size-4" /></Button><ConfirmDeleteButton onConfirm={() => excluirReuniao(reuniao.id)} /></div></CardHeader><CardContent className="space-y-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Participantes</p><p className="mt-1 text-sm">{reuniao.participante_nomes?.join(", ") || "Nenhum participante selecionado"}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo da reunião</p><p className="mt-1 whitespace-pre-wrap text-sm">{reuniao.resumo || "Sem resumo."}</p></div><div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><p className="text-sm font-medium">Transcrição externa</p><p className="text-xs text-muted-foreground">Cole um texto produzido pelo aplicativo que você já utiliza.</p></div><Button variant="outline" onClick={importarTranscricao}><FileText className="size-4" />{reuniao.transcricao ? "Editar transcrição" : "Importar transcrição"}</Button></div>{reuniao.transcricao && <div className="rounded-lg border bg-muted/25 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transcrição original</p>{reuniao.transcricao_fonte && <Badge variant="outline">Fonte: {reuniao.transcricao_fonte}</Badge>}</div><div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{reuniao.transcricao}</div></div>}</CardContent></Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-heading text-xl font-bold">Backlog da reunião</h2><p className="text-sm text-muted-foreground">Ações, responsáveis e prazos definidos.</p></div><Button onClick={novoItem}><Plus className="size-4" />Adicionar item</Button></div>
        <div className="flex flex-wrap gap-2">{(["todos", "nao_realizado", "em_andamento", "concluido"] as const).map((s) => <Button key={s} size="sm" variant={filtro === s ? "default" : "outline"} onClick={() => setFiltro(s)}>{s === "todos" ? "Todos" : STATUS[s]}</Button>)}</div>
        {itensDaReuniao.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum item neste filtro.</CardContent></Card> : <div className="grid gap-3 md:grid-cols-2">{itensDaReuniao.map((i) => <Card key={i.id}><CardContent className="pt-5"><div className="flex items-start justify-between gap-3"><StatusIcon status={i.status} /><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => editarItem(i)} aria-label="Editar item"><Pencil className="size-4" /></Button><ConfirmDeleteButton onConfirm={() => excluirItem(i.id)} /></div></div><p className="mt-3 font-medium">{i.descricao}</p><div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">{STATUS[i.status]}</Badge><Badge className={i.prioridade === "alta" ? "bg-destructive text-destructive-foreground" : ""} variant={i.prioridade === "alta" ? "default" : "secondary"}>{PRIORIDADE[i.prioridade]}</Badge></div><div className="mt-4 space-y-1 text-xs text-muted-foreground"><p>Responsável: {i.responsavel_nome || "Não definido"}</p><p>Prazo: {i.prazo ? new Date(`${i.prazo}T12:00:00`).toLocaleDateString("pt-BR") : "Sem prazo"}</p></div></CardContent></Card>)}</div>}
      </div> : <Card><CardContent className="grid min-h-64 place-items-center text-sm text-muted-foreground">Selecione uma reunião.</CardContent></Card>}
    </div>
    <Dialog open={dialogReuniao} onOpenChange={setDialogReuniao}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editReuniao ? "Editar reunião" : "Nova reunião"}</DialogTitle></DialogHeader><div className="grid gap-4"><div className="grid gap-1.5"><Label>Título</Label><Input value={formReuniao.titulo} onChange={(e) => setFormReuniao({ ...formReuniao, titulo: e.target.value })} placeholder="Ex.: Planejamento da semana" /></div><div className="grid gap-1.5"><Label>Data e hora</Label><Input type="datetime-local" value={formReuniao.inicio} onChange={(e) => setFormReuniao({ ...formReuniao, inicio: e.target.value })} /></div><div className="grid gap-2"><Label>Participantes</Label><div className="grid max-h-36 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">{ativos.map((p) => <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={formReuniao.participante_ids.includes(p.id)} onChange={(e) => setFormReuniao({ ...formReuniao, participante_ids: e.target.checked ? [...formReuniao.participante_ids, p.id] : formReuniao.participante_ids.filter((id) => id !== p.id) })} />{p.nome}</label>)}{ativos.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pessoa ativa cadastrada.</p>}</div></div><div className="grid gap-1.5"><Label>Resumo e anotações</Label><Textarea rows={5} value={formReuniao.resumo} onChange={(e) => setFormReuniao({ ...formReuniao, resumo: e.target.value })} placeholder="Decisões, contexto e observações da reunião" /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogReuniao(false)}>Cancelar</Button><Button onClick={salvarReuniao} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Salvar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialogItem} onOpenChange={setDialogItem}><DialogContent><DialogHeader><DialogTitle>{editItem ? "Editar item" : "Novo item do backlog"}</DialogTitle></DialogHeader><div className="grid gap-4"><div className="grid gap-1.5"><Label>Descrição</Label><Textarea value={formItem.descricao} onChange={(e) => setFormItem({ ...formItem, descricao: e.target.value })} placeholder="O que precisa ser feito?" /></div><div className="grid gap-1.5"><Label>Responsável</Label><Select value={formItem.responsavel_id || "sem_responsavel"} onValueChange={(v) => setFormItem({ ...formItem, responsavel_id: v === "sem_responsavel" ? "" : v ?? "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem_responsavel">Não definido</SelectItem>{ativos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label>Prazo</Label><Input type="date" value={formItem.prazo} onChange={(e) => setFormItem({ ...formItem, prazo: e.target.value })} /></div><div className="grid gap-1.5"><Label>Prioridade</Label><Select value={formItem.prioridade} onValueChange={(v) => setFormItem({ ...formItem, prioridade: v as Prioridade })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PRIORIDADE).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-1.5"><Label>Status</Label><Select value={formItem.status} onValueChange={(v) => setFormItem({ ...formItem, status: v as Status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogItem(false)}>Cancelar</Button><Button onClick={salvarItem} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Salvar item</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialogTranscricao} onOpenChange={setDialogTranscricao}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Importar transcrição</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">O Salgadou não grava nem acompanha reuniões. Cole abaixo a transcrição gerada pelo aplicativo externo de sua preferência.</p><div className="grid gap-4"><div className="grid gap-1.5"><Label>Fonte ou aplicativo (opcional)</Label><Input value={formTranscricao.fonte} onChange={(e) => setFormTranscricao({ ...formTranscricao, fonte: e.target.value })} placeholder="Ex.: Google Meet, Tactiq, Notta" /></div><div className="grid gap-1.5"><Label>Transcrição original</Label><Textarea rows={10} value={formTranscricao.transcricao} onChange={(e) => setFormTranscricao({ ...formTranscricao, transcricao: e.target.value })} placeholder="Cole aqui o texto completo da transcrição" /></div><div className="grid gap-1.5"><Label>Resumo editável (opcional)</Label><Textarea rows={4} value={formTranscricao.resumo} onChange={(e) => setFormTranscricao({ ...formTranscricao, resumo: e.target.value })} placeholder="Registre manualmente decisões e principais pontos" /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogTranscricao(false)}>Cancelar</Button><Button onClick={salvarTranscricao} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Salvar transcrição</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "concluido") return <CheckCircle2 className="size-5 text-emerald-500" />
  if (status === "em_andamento") return <Clock3 className="size-5 text-primary" />
  return <CircleDashed className="size-5 text-muted-foreground" />
}
