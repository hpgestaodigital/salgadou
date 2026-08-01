"use client"

import { useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, ClipboardList, Download, Eye, Loader2, Paperclip, Plus, Search, Upload } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mensagemErroSupabase } from "@/lib/supabase/friendly-error"
import { getNome } from "@/lib/auth-roles"
import { useTable } from "@/lib/use-data"
import type { Colaborador } from "@/lib/types"
import { ConfirmDeleteButton } from "@/components/confirm-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type StatusDemanda = "nao_iniciado" | "em_analise" | "aguardando_retorno" | "concluido"
type PrioridadeDemanda = "baixa" | "normal" | "alta" | "urgente"
type DemandaJuridica = { id: string; titulo: string; descricao: string; solicitante_nome: string; setor: string | null; prioridade: PrioridadeDemanda; status: StatusDemanda; prazo: string | null; responsavel_id: string | null; responsavel_nome: string | null; created_at: string }
type DocumentoDemanda = { id: string; demanda_id: string | null; titulo: string; categoria: string; anexo_path: string; anexo_nome: string; anexo_tamanho: number | null }

const STATUS: Record<StatusDemanda, string> = { nao_iniciado: "Não iniciado", em_analise: "Em análise", aguardando_retorno: "Aguardando retorno", concluido: "Concluído" }
const PRIORIDADE: Record<PrioridadeDemanda, string> = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" }
const vazio = { titulo: "", descricao: "", setor: "", prioridade: "normal" as PrioridadeDemanda, prazo: "", responsavel_id: "" }

export function JuridicoDemandas({ pessoas }: { pessoas: Colaborador[] }) {
  const supabase = createClient()
  const { data: demandas, error, mutate } = useTable<DemandaJuridica>("demandas_juridicas", { column: "created_at", ascending: false })
  const { data: documentos, mutate: mutateDocumentos } = useTable<DocumentoDemanda>("documentos_juridicos", { column: "created_at", ascending: false })
  const [aberto, setAberto] = useState(false)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [form, setForm] = useState(vazio)
  const [arquivoInicial, setArquivoInicial] = useState<File | null>(null)
  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState("abertas")
  const [salvando, setSalvando] = useState(false)
  const [anexando, setAnexando] = useState(false)
  const ativos = pessoas.filter((p) => p.ativo)
  const detalhe = demandas.find((demanda) => demanda.id === detalheId) ?? null
  const documentosDetalhe = documentos.filter((documento) => documento.demanda_id === detalheId)
  const visiveis = useMemo(() => demandas.filter((demanda) => {
    if (filtro === "abertas" && demanda.status === "concluido") return false
    if (filtro !== "todas" && filtro !== "abertas" && demanda.status !== filtro) return false
    const termo = busca.trim().toLocaleLowerCase("pt-BR")
    return !termo || [demanda.titulo, demanda.descricao, demanda.solicitante_nome, demanda.setor, demanda.responsavel_nome].some((valor) => valor?.toLocaleLowerCase("pt-BR").includes(termo))
  }), [busca, demandas, filtro])

  function validarArquivo(file: File) {
    const tipos = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    if (!tipos.includes(file.type)) return "Use PDF, DOC ou DOCX."
    if (file.size > 10 * 1024 * 1024) return "O arquivo deve ter no máximo 10 MB."
    return null
  }

  async function anexarDocumento(demanda: Pick<DemandaJuridica, "id" | "titulo" | "responsavel_id" | "responsavel_nome">, file: File) {
    const erroArquivo = validarArquivo(file)
    if (erroArquivo) throw new Error(erroArquivo)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error("Sua sessão expirou. Entre novamente.")
    const documentoId = crypto.randomUUID()
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf"
    const path = `documents/${auth.user.id}/${documentoId}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from("erp-legal-contracts").upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const { error: insertError } = await supabase.from("documentos_juridicos").insert({ id: documentoId, demanda_id: demanda.id, titulo: `Anexo — ${demanda.titulo}`, categoria: "Documento de demanda", descricao: `Arquivo anexado à demanda jurídica: ${demanda.titulo}`, responsavel_id: demanda.responsavel_id, responsavel_nome: demanda.responsavel_nome, anexo_path: path, anexo_nome: file.name, anexo_mime: file.type, anexo_tamanho: file.size })
    if (insertError) { await supabase.storage.from("erp-legal-contracts").remove([path]); throw insertError }
    await mutateDocumentos()
  }

  async function salvar() {
    if (!form.titulo.trim()) return toast.error("Informe o assunto da demanda.")
    if (!form.descricao.trim()) return toast.error("Descreva o que o Jurídico precisa fazer.")
    if (arquivoInicial) { const erro = validarArquivo(arquivoInicial); if (erro) return toast.error(erro) }
    setSalvando(true)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setSalvando(false); return toast.error("Sua sessão expirou. Entre novamente.") }
    const responsavel = ativos.find((p) => p.id === form.responsavel_id)
    const { data, error: insertError } = await supabase.from("demandas_juridicas").insert({ titulo: form.titulo.trim(), descricao: form.descricao.trim(), solicitante_nome: getNome(auth.user) || auth.user.email || "Usuário", setor: form.setor.trim() || null, prioridade: form.prioridade, prazo: form.prazo || null, responsavel_id: responsavel?.id ?? null, responsavel_nome: responsavel?.nome ?? null }).select("id, titulo, responsavel_id, responsavel_nome").single()
    if (insertError) { setSalvando(false); return toast.error(mensagemErroSupabase(insertError, "Não foi possível registrar. Aplique a atualização de demandas jurídicas no Supabase.")) }
    let anexoFalhou = false
    if (arquivoInicial) { try { await anexarDocumento(data, arquivoInicial) } catch { anexoFalhou = true } }
    setSalvando(false); setAberto(false); setArquivoInicial(null); setForm(vazio); await mutate(); setDetalheId(data.id)
    toast[anexoFalhou ? "warning" : "success"](anexoFalhou ? "Demanda criada, mas o anexo não pôde ser enviado." : "Demanda enviada ao Jurídico.")
  }

  async function alterarStatus(demanda: DemandaJuridica, status: StatusDemanda) {
    const { error: updateError } = await supabase.from("demandas_juridicas").update({ status, concluido_em: status === "concluido" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", demanda.id)
    if (updateError) return toast.error("Não foi possível atualizar o andamento.")
    await mutate(); toast.success("Andamento atualizado.")
  }

  async function abrirDocumento(documento: DocumentoDemanda) {
    const { data, error: signedError } = await supabase.storage.from("erp-legal-contracts").createSignedUrl(documento.anexo_path, 60)
    if (signedError) return toast.error("Não foi possível abrir o documento.")
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  async function excluirDocumento(documento: DocumentoDemanda): Promise<void> {
    const { error: storageError } = await supabase.storage.from("erp-legal-contracts").remove([documento.anexo_path])
    if (storageError) {
      toast.error("Não foi possível remover o arquivo privado.")
      return
    }

    const { error: deleteError } = await supabase.from("documentos_juridicos").delete().eq("id", documento.id)
    if (deleteError) {
      toast.error("O arquivo foi removido, mas o cadastro do documento não pôde ser excluído.")
      return
    }

    await mutateDocumentos()
    toast.success("Documento excluído definitivamente.")
  }

  async function adicionarAoDetalhe(file: File) {
    if (!detalhe) return
    setAnexando(true)
    try { await anexarDocumento(detalhe, file); toast.success("Documento vinculado à demanda.") } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível anexar o documento.") } finally { setAnexando(false) }
  }

  async function excluir(demanda: DemandaJuridica): Promise<void> {
    const { error: deleteError } = await supabase.from("demandas_juridicas").delete().eq("id", demanda.id)
    if (deleteError) { toast.error("Não foi possível excluir a demanda."); return }
    if (detalheId === demanda.id) setDetalheId(null)
    await Promise.all([mutate(), mutateDocumentos()]); toast.success("Demanda excluída. Os documentos continuam no arquivo jurídico.")
  }

  return <section id="demandas-juridicas" className="mt-8 space-y-4 border-t pt-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><ClipboardList className="size-5 text-primary" /><h2 className="font-heading text-2xl font-bold">Demandas jurídicas</h2></div><p className="mt-1 text-sm text-muted-foreground">Solicitações, documentos recebidos e pendências que precisam da atenção do Jurídico.</p></div><Button onClick={() => setAberto(true)}><Plus className="size-4" />Nova demanda</Button></div>
    {error ? <Card className="border-destructive/40"><CardContent className="py-5 text-sm">Aplique as atualizações de demandas e vínculos jurídicos no Supabase para habilitar esta área.</CardContent></Card> : <>
      {demandas.length > 0 && <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar demanda, solicitante ou responsável" /></div><Select value={filtro} onValueChange={(valor) => setFiltro(valor ?? "abertas")}><SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="abertas">Demandas abertas</SelectItem><SelectItem value="nao_iniciado">Não iniciadas</SelectItem><SelectItem value="em_analise">Em análise</SelectItem><SelectItem value="aguardando_retorno">Aguardando retorno</SelectItem><SelectItem value="concluido">Concluídas</SelectItem><SelectItem value="todas">Todas</SelectItem></SelectContent></Select></div>}
      {demandas.length === 0 ? <Card><CardContent className="py-10 text-center"><ClipboardList className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-semibold">Nenhuma demanda jurídica</p><p className="mt-1 text-sm text-muted-foreground">Use “Nova demanda” para informar o que precisa ser analisado e já anexar os documentos recebidos.</p></CardContent></Card> : visiveis.length === 0 ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma demanda corresponde aos filtros.</CardContent></Card> : <div className="grid gap-3 lg:grid-cols-2">{visiveis.map((demanda) => { const quantidade = documentos.filter((documento) => documento.demanda_id === demanda.id).length; return <Card key={demanda.id} className={demanda.prioridade === "urgente" ? "border-destructive/50" : undefined}><CardContent className="pt-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><Badge variant={demanda.prioridade === "urgente" ? "destructive" : "outline"}>{PRIORIDADE[demanda.prioridade]}</Badge><Badge variant="secondary">{STATUS[demanda.status]}</Badge>{quantidade > 0 && <Badge variant="outline"><Paperclip className="mr-1 size-3" />{quantidade} {quantidade === 1 ? "arquivo" : "arquivos"}</Badge>}</div><h3 className="mt-3 font-semibold">{demanda.titulo}</h3></div><ConfirmDeleteButton onConfirm={() => excluir(demanda)} label="Excluir demanda" description="A solicitação será excluída. Os documentos vinculados continuarão no arquivo jurídico." /></div><p className="mt-3 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{demanda.descricao}</p><div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2"><p>Solicitado por: <span className="text-foreground">{demanda.solicitante_nome}</span></p><p>Responsável: <span className="text-foreground">{demanda.responsavel_nome || "A definir"}</span></p><p>Setor: <span className="text-foreground">{demanda.setor || "Não informado"}</span></p><p>Prazo: <span className="text-foreground">{demanda.prazo ? new Date(`${demanda.prazo}T12:00:00`).toLocaleDateString("pt-BR") : "Sem prazo"}</span></p></div><Button className="mt-4 w-full" variant="outline" onClick={() => setDetalheId(demanda.id)}><Eye className="size-4" />Ver detalhes e documentos</Button></CardContent></Card> })}</div>}
    </>}
    <Dialog open={aberto} onOpenChange={setAberto}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Nova demanda jurídica</DialogTitle></DialogHeader><div className="grid gap-4"><div className="grid gap-1.5"><Label>Assunto</Label><Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Analisar notificação recebida do fornecedor" /></div><div className="grid gap-1.5"><Label>O que precisa do Jurídico?</Label><Textarea rows={5} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Explique a situação, o resultado esperado e as informações importantes para a análise." /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label>Setor solicitante</Label><Input value={form.setor} onChange={(e) => setForm({ ...form, setor: e.target.value })} placeholder="Ex.: Financeiro" /></div><div className="grid gap-1.5"><Label>Prioridade</Label><Select value={form.prioridade} onValueChange={(valor) => setForm({ ...form, prioridade: (valor ?? "normal") as PrioridadeDemanda })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PRIORIDADE).map(([valor, rotulo]) => <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label>Prazo desejado</Label><Input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} /></div><div className="grid gap-1.5"><Label>Responsável</Label><Select value={form.responsavel_id || "definir"} onValueChange={(valor) => setForm({ ...form, responsavel_id: valor === "definir" ? "" : valor ?? "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="definir">A definir pelo Jurídico</SelectItem>{ativos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select></div></div><div className="grid gap-1.5 rounded-xl border p-4"><Label>Documento para análise (opcional)</Label><Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setArquivoInicial(e.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">O arquivo ficará vinculado à demanda e também disponível nos Documentos jurídicos. PDF, DOC ou DOCX, até 10 MB.</p></div><div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground"><AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" /><p>Depois do envio, outros documentos poderão ser adicionados pela janela de detalhes.</p></div></div><DialogFooter><Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Enviar demanda</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(detalhe)} onOpenChange={(open) => { if (!open) setDetalheId(null) }}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">{detalhe && <><DialogHeader><DialogTitle>{detalhe.titulo}</DialogTitle></DialogHeader><div className="space-y-5"><div className="flex flex-wrap gap-2"><Badge variant={detalhe.prioridade === "urgente" ? "destructive" : "outline"}>{PRIORIDADE[detalhe.prioridade]}</Badge><Badge variant="secondary">{STATUS[detalhe.status]}</Badge></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição da demanda</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{detalhe.descricao}</p></div><div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2"><Info label="Solicitado por" value={detalhe.solicitante_nome} /><Info label="Setor" value={detalhe.setor || "Não informado"} /><Info label="Responsável" value={detalhe.responsavel_nome || "A definir"} /><Info label="Prazo" value={detalhe.prazo ? new Date(`${detalhe.prazo}T12:00:00`).toLocaleDateString("pt-BR") : "Sem prazo"} /></div><div className="grid gap-1.5"><Label>Andamento</Label><Select value={detalhe.status} onValueChange={(status) => alterarStatus(detalhe, status as StatusDemanda)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS).map(([valor, rotulo]) => <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>)}</SelectContent></Select></div><div className="space-y-3 border-t pt-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Documentos vinculados</h3><p className="text-xs text-muted-foreground">Arquivos privados enviados junto com esta solicitação.</p></div><Button asChild variant="outline" disabled={anexando}><label className="cursor-pointer">{anexando ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Anexar documento<input className="sr-only" type="file" accept=".pdf,.doc,.docx" onChange={(e) => { const file = e.target.files?.[0]; if (file) adicionarAoDetalhe(file); e.currentTarget.value = "" }} /></label></Button></div>{documentosDetalhe.length === 0 ? <div className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground"><Paperclip className="mx-auto mb-2 size-6" />Nenhum documento anexado a esta demanda.</div> : <div className="space-y-2">{documentosDetalhe.map((documento) => <div key={documento.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-medium">{documento.anexo_nome}</p><p className="mt-1 text-xs text-muted-foreground">{documento.categoria} · {documento.anexo_tamanho ? `${(documento.anexo_tamanho / 1024).toFixed(0)} KB` : "Tamanho não informado"}</p></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => abrirDocumento(documento)}><Download className="size-4" />Abrir</Button><ConfirmDeleteButton onConfirm={() => excluirDocumento(documento)} label="Excluir documento" description="O cadastro e o arquivo privado serão excluídos definitivamente." /></div></div>)}</div>}</div></div></>}</DialogContent></Dialog>
  </section>
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm">{value}</p></div> }
