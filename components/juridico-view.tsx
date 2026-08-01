"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Clock3, Download, FileSignature, FileText, Loader2, MessageCircle, Paperclip, Plus, Scale, ShieldCheck, Sparkles, Upload } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { getPapel, type Papel } from "@/lib/auth-roles"
import { mensagemErroSupabase } from "@/lib/supabase/friendly-error"
import { useTable } from "@/lib/use-data"
import type { Colaborador } from "@/lib/types"
import { PageHeader } from "@/components/page-header"
import { JuridicoDocumentos } from "@/components/juridico-documentos"
import { JuridicoDemandas } from "@/components/juridico-demandas"
import { ConfirmDeleteButton } from "@/components/confirm-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type StatusContrato = "rascunho" | "validacao_socios" | "ajustes" | "aprovado" | "assinatura_pendente" | "assinado" | "arquivado"
type Contrato = { id: string; titulo: string; tipo: string | null; contraparte: string | null; responsavel_id: string | null; responsavel_nome: string | null; status: StatusContrato; vencimento: string | null; observacoes: string | null; anexo_path: string | null; anexo_nome: string | null; anexo_mime: string | null; anexo_tamanho: number | null; created_at: string }
type Validacao = { id: string; contrato_id: string; socio_id: string | null; socio_nome: string; status: "pendente" | "aprovado" | "ajustes"; observacao: string | null; validado_em: string | null }
type Signatario = { id: string; contrato_id: string; nome: string; email: string | null; whatsapp: string | null; status: "pendente" | "notificado" | "assinado"; lembrete_enviado_em: string | null; assinado_em: string | null }
type Lembrete = { id: string; contrato_id: string; tipo: "validacao_socios" | "assinatura"; destinatario_nome: string; status: "enviado" | "nao_configurado" | "falhou"; created_at: string }

const STATUS: Record<StatusContrato, string> = { rascunho: "Rascunho", validacao_socios: "Validação dos sócios", ajustes: "Ajustes solicitados", aprovado: "Aprovado", assinatura_pendente: "Assinatura pendente", assinado: "Assinado", arquivado: "Arquivado" }
const TIPOS = ["Prestação de serviços", "Fornecedor", "Parceria", "Trabalhista", "Locação", "Confidencialidade", "Outro"]
const contratoVazio = { titulo: "", tipo: "Prestação de serviços", contraparte: "", responsavel_id: "", vencimento: "", observacoes: "" }
const signatarioVazio = { nome: "", email: "", whatsapp: "" }

export function JuridicoView() {
  const supabase = createClient()
  const { data: contratos, error, mutate: mutateContratos } = useTable<Contrato>("contratos", { column: "created_at", ascending: false })
  const { data: validacoes, mutate: mutateValidacoes } = useTable<Validacao>("contrato_validacoes", { column: "created_at" })
  const { data: signatarios, mutate: mutateSignatarios } = useTable<Signatario>("contrato_signatarios", { column: "created_at" })
  const { data: lembretes, mutate: mutateLembretes } = useTable<Lembrete>("contrato_lembretes", { column: "created_at", ascending: false })
  const { data: pessoas } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const ativos = pessoas.filter((p) => p.ativo)
  const socios = ativos.filter((p) => p.tipo === "Sócio")
  const [papel, setPapel] = useState<Papel>("colaborador")
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [dialogContrato, setDialogContrato] = useState(false)
  const [dialogSignatario, setDialogSignatario] = useState(false)
  const [formContrato, setFormContrato] = useState(contratoVazio)
  const [formSignatario, setFormSignatario] = useState(signatarioVazio)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [gerandoExemplo, setGerandoExemplo] = useState(false)

  useEffect(() => { supabase.auth.getUser().then(({ data }: { data: { user: import("@supabase/supabase-js").User | null } }) => setPapel(getPapel(data.user))) }, [supabase])
  useEffect(() => { if (!selecionado && contratos[0]) setSelecionado(contratos[0].id) }, [contratos, selecionado])
  const contrato = contratos.find((c) => c.id === selecionado) ?? null
  const validacoesContrato = useMemo(() => validacoes.filter((v) => v.contrato_id === selecionado), [validacoes, selecionado])
  const signatariosContrato = useMemo(() => signatarios.filter((s) => s.contrato_id === selecionado), [signatarios, selecionado])
  const lembretesContrato = useMemo(() => lembretes.filter((l) => l.contrato_id === selecionado), [lembretes, selecionado])
  const pendenciasAssinatura = useMemo(() => signatarios.filter((s) => s.status !== "assinado").map((signatario) => ({ signatario, contrato: contratos.find((c) => c.id === signatario.contrato_id) })).filter((item) => item.contrato && ["aprovado", "assinatura_pendente"].includes(item.contrato.status)), [signatarios, contratos])
  const podeValidar = papel === "admin" || papel === "socio"

  async function gerarExemplosJuridico() {
    setGerandoExemplo(true)
    let contratoId: string | null = null
    let demandaId: string | null = null
    let documentoId: string | null = null
    let contratoPath: string | null = null
    let documentoPath: string | null = null
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("Sua sessão expirou. Entre novamente.")
      const consultas = await Promise.all([
        supabase.from("contratos").select("id").ilike("titulo", "[EXEMPLO]%").limit(1),
        supabase.from("demandas_juridicas").select("id").ilike("titulo", "[EXEMPLO]%").limit(1),
        supabase.from("documentos_juridicos").select("id").ilike("titulo", "[EXEMPLO]%").limit(1),
      ])
      if (consultas.some(({ data }) => data?.length)) {
        toast.warning("Os exemplos do Jurídico já foram criados.")
        return
      }
      if (consultas.some(({ error }) => error)) throw new Error("Aplique primeiro as atualizações SQL de contratos, documentos e demandas jurídicas.")

      const hoje = new Date()
      const dataEm = (dias: number) => { const data = new Date(hoje); data.setDate(data.getDate() + dias); return data.toISOString().slice(0, 10) }
      const pdf = criarPdfExemplo()
      contratoId = crypto.randomUUID()
      contratoPath = `contracts/${auth.user.id}/${contratoId}/contrato-exemplo.pdf`
      const { error: uploadContratoError } = await supabase.storage.from("erp-legal-contracts").upload(contratoPath, pdf, { contentType: "application/pdf", upsert: false })
      if (uploadContratoError) throw uploadContratoError
      const responsavel = ativos[0]
      const { error: contratoError } = await supabase.from("contratos").insert({
        id: contratoId,
        titulo: "[EXEMPLO] Contrato de prestação de serviços",
        tipo: "Prestação de serviços",
        contraparte: "Empresa Demonstração Ltda.",
        responsavel_id: responsavel?.id ?? null,
        responsavel_nome: responsavel?.nome ?? "Equipe Salgadou",
        status: "assinatura_pendente",
        vencimento: dataEm(30),
        observacoes: "Registro fictício criado somente para demonstrar o fluxo de validação dos sócios e assinatura. Não possui valor jurídico.",
        anexo_path: contratoPath,
        anexo_nome: "contrato-exemplo.pdf",
        anexo_mime: "application/pdf",
        anexo_tamanho: pdf.size,
      })
      if (contratoError) throw contratoError
      const validadores = socios.length ? socios.slice(0, 2).map((s) => ({ contrato_id: contratoId, socio_id: s.id, socio_nome: s.nome, status: "aprovado", observacao: "Aprovação fictícia para demonstração.", validado_em: new Date().toISOString() })) : [{ contrato_id: contratoId, socio_id: null, socio_nome: "Sócio de exemplo", status: "aprovado", observacao: "Aprovação fictícia para demonstração.", validado_em: new Date().toISOString() }]
      const { error: validacaoError } = await supabase.from("contrato_validacoes").insert(validadores)
      if (validacaoError) throw validacaoError
      const { error: signatarioError } = await supabase.from("contrato_signatarios").insert([
        { contrato_id: contratoId, nome: "Representante da Salgadou", email: "exemplo@salgadou.com.br", status: "assinado", assinado_em: new Date().toISOString() },
        { contrato_id: contratoId, nome: "Representante da contratada", email: "contato@empresa-exemplo.com.br", whatsapp: "5500000000000", status: "pendente" },
      ])
      if (signatarioError) throw signatarioError

      demandaId = crypto.randomUUID()
      const { error: demandaError } = await supabase.from("demandas_juridicas").insert({
        id: demandaId,
        titulo: "[EXEMPLO] Analisar notificação de fornecedor",
        descricao: "Verificar os prazos indicados na notificação fictícia e orientar o Financeiro sobre a resposta adequada. Este registro serve apenas para demonstrar a fila de demandas.",
        solicitante_nome: "Equipe Financeira (exemplo)",
        setor: "Financeiro",
        prioridade: "alta",
        status: "em_analise",
        prazo: dataEm(7),
        responsavel_id: responsavel?.id ?? null,
        responsavel_nome: responsavel?.nome ?? "Jurídico",
      })
      if (demandaError) throw demandaError

      documentoId = crypto.randomUUID()
      documentoPath = `documents/${auth.user.id}/${documentoId}/parecer-exemplo.pdf`
      const { error: uploadDocumentoError } = await supabase.storage.from("erp-legal-contracts").upload(documentoPath, pdf, { contentType: "application/pdf", upsert: false })
      if (uploadDocumentoError) throw uploadDocumentoError
      const { error: documentoError } = await supabase.from("documentos_juridicos").insert({
        id: documentoId,
        demanda_id: demandaId,
        titulo: "[EXEMPLO] Parecer sobre renovação contratual",
        categoria: "Parecer jurídico",
        descricao: "Documento fictício usado para mostrar como pareceres, procurações, atas e outros arquivos ficam organizados.",
        data_documento: dataEm(0),
        referencia: "PARECER-DEMO-001",
        responsavel_id: responsavel?.id ?? null,
        responsavel_nome: responsavel?.nome ?? "Jurídico",
        anexo_path: documentoPath,
        anexo_nome: "parecer-exemplo.pdf",
        anexo_mime: "application/pdf",
        anexo_tamanho: pdf.size,
      })
      if (documentoError) throw documentoError

      await Promise.all([mutateContratos(), mutateValidacoes(), mutateSignatarios()])
      toast.success("Exemplos do Jurídico criados. Todos estão marcados como [EXEMPLO].")
      window.setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      if (documentoId) await supabase.from("documentos_juridicos").delete().eq("id", documentoId)
      if (documentoPath) await supabase.storage.from("erp-legal-contracts").remove([documentoPath])
      if (demandaId) await supabase.from("demandas_juridicas").delete().eq("id", demandaId)
      if (contratoId) await supabase.from("contratos").delete().eq("id", contratoId)
      if (contratoPath) await supabase.storage.from("erp-legal-contracts").remove([contratoPath])
      toast.error(e instanceof Error ? e.message : "Não foi possível criar os exemplos.")
    } finally {
      setGerandoExemplo(false)
    }
  }

  function validarArquivo(file: File) {
    const tipos = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    if (!tipos.includes(file.type)) return "Use PDF, DOC ou DOCX."
    if (file.size > 10 * 1024 * 1024) return "O arquivo deve ter no máximo 10 MB."
    return null
  }

  async function uploadContrato(contratoId: string, file: File) {
    const erroArquivo = validarArquivo(file)
    if (erroArquivo) throw new Error(erroArquivo)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) throw new Error("Sessão expirada.")
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf"
    const path = `contracts/${auth.user.id}/${contratoId}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from("erp-legal-contracts").upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const { error: updateError } = await supabase.from("contratos").update({ anexo_path: path, anexo_nome: file.name, anexo_mime: file.type, anexo_tamanho: file.size, updated_at: new Date().toISOString() }).eq("id", contratoId)
    if (updateError) { await supabase.storage.from("erp-legal-contracts").remove([path]); throw updateError }
  }

  async function salvarContrato() {
    if (!formContrato.titulo.trim()) return toast.error("Informe o título do contrato.")
    if (arquivo) { const erroArquivo = validarArquivo(arquivo); if (erroArquivo) return toast.error(erroArquivo) }
    setSaving(true)
    const responsavel = ativos.find((p) => p.id === formContrato.responsavel_id)
    const { data, error: insertError } = await supabase.from("contratos").insert({ titulo: formContrato.titulo.trim(), tipo: formContrato.tipo || null, contraparte: formContrato.contraparte.trim() || null, responsavel_id: responsavel?.id ?? null, responsavel_nome: responsavel?.nome ?? null, vencimento: formContrato.vencimento || null, observacoes: formContrato.observacoes.trim() || null }).select("id").single()
    if (insertError) { setSaving(false); return toast.error(mensagemErroSupabase(insertError, "Não foi possível salvar. Aplique a migração do setor Jurídico.")) }
    try { if (arquivo) await uploadContrato(data.id, arquivo) } catch (e) { setSaving(false); mutateContratos(); return toast.error(e instanceof Error ? e.message : "Contrato criado, mas o anexo falhou.") }
    setSaving(false); setDialogContrato(false); setArquivo(null); setFormContrato(contratoVazio); setSelecionado(data.id); mutateContratos(); toast.success("Contrato cadastrado.")
  }

  async function substituirAnexo(file: File) {
    if (!contrato) return
    const erroArquivo = validarArquivo(file); if (erroArquivo) return toast.error(erroArquivo)
    setSaving(true)
    const antigo = contrato.anexo_path
    try { await uploadContrato(contrato.id, file); if (antigo) await supabase.storage.from("erp-legal-contracts").remove([antigo]); await mutateContratos(); toast.success("Anexo atualizado.") }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível anexar.") }
    finally { setSaving(false) }
  }

  async function baixarAnexo() {
    if (!contrato?.anexo_path) return
    const { data, error: signedError } = await supabase.storage.from("erp-legal-contracts").createSignedUrl(contrato.anexo_path, 60)
    if (signedError) return toast.error("Não foi possível abrir o documento.")
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  async function enviarValidacao() {
    if (!contrato) return
    if (!contrato.anexo_path) return toast.error("Anexe o contrato antes de solicitar validação.")
    if (!socios.length) return toast.error("Cadastre ao menos um sócio ativo com WhatsApp.")
    setSaving(true)
    await supabase.from("contrato_validacoes").delete().eq("contrato_id", contrato.id)
    const { error: validacaoError } = await supabase.from("contrato_validacoes").insert(socios.map((s) => ({ contrato_id: contrato.id, socio_id: s.id, socio_nome: s.nome })))
    if (!validacaoError) await supabase.from("contratos").update({ status: "validacao_socios", updated_at: new Date().toISOString() }).eq("id", contrato.id)
    if (validacaoError) { setSaving(false); return toast.error("Não foi possível iniciar a validação.") }
    const response = await fetch("/api/juridico/lembrete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contrato_id: contrato.id, tipo: "validacao_socios" }) })
    const result = await response.json().catch(() => ({}))
    setSaving(false); mutateContratos(); mutateValidacoes(); mutateLembretes()
    toast.success(result.configurada ? "Enviado aos sócios para validação." : "Validação criada. WhatsApp ainda não está configurado.")
  }

  async function validar(id: string, status: "aprovado" | "ajustes") {
    const observacao = status === "ajustes" ? "Ajustes solicitados pelo sócio no fluxo jurídico." : null
    await supabase.from("contrato_validacoes").update({ status, observacao, validado_em: new Date().toISOString() }).eq("id", id)
    const atualizadas = validacoesContrato.map((v) => v.id === id ? { ...v, status } : v)
    const contratoStatus = atualizadas.some((v) => v.status === "ajustes") ? "ajustes" : atualizadas.every((v) => v.status === "aprovado") ? "aprovado" : "validacao_socios"
    await supabase.from("contratos").update({ status: contratoStatus, updated_at: new Date().toISOString() }).eq("id", selecionado!)
    mutateValidacoes(); mutateContratos(); toast.success(status === "aprovado" ? "Contrato aprovado." : "Ajustes solicitados.")
  }

  async function salvarSignatario() {
    if (!contrato || !formSignatario.nome.trim()) return toast.error("Informe o nome do signatário.")
    const { error: signError } = await supabase.from("contrato_signatarios").insert({ contrato_id: contrato.id, nome: formSignatario.nome.trim(), email: formSignatario.email.trim() || null, whatsapp: formSignatario.whatsapp.replace(/\D/g, "") || null })
    if (signError) return toast.error("Não foi possível adicionar o signatário.")
    if (contrato.status === "aprovado") await supabase.from("contratos").update({ status: "assinatura_pendente" }).eq("id", contrato.id)
    setDialogSignatario(false); setFormSignatario(signatarioVazio); mutateSignatarios(); mutateContratos(); toast.success("Signatário adicionado.")
  }

  async function enviarLembrete(signatario: Signatario) {
    if (!contrato) return
    if (!["aprovado", "assinatura_pendente"].includes(contrato.status)) return toast.error("Os sócios precisam aprovar o contrato antes dos lembretes de assinatura.")
    const response = await fetch("/api/juridico/lembrete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contrato_id: contrato.id, tipo: "assinatura", signatario_id: signatario.id }) })
    const result = await response.json().catch(() => ({}))
    mutateSignatarios(); mutateLembretes()
    if (!response.ok) return toast.error(result.error || "Não foi possível enviar.")
    toast[result.ok ? "success" : "warning"](result.ok ? "Lembrete enviado." : "Lembrete registrado; WhatsApp não configurado.")
  }

  async function marcarAssinado(signatario: Signatario) {
    await supabase.from("contrato_signatarios").update({ status: "assinado", assinado_em: new Date().toISOString() }).eq("id", signatario.id)
    const todosAssinados = signatariosContrato.every((s) => s.id === signatario.id || s.status === "assinado")
    if (todosAssinados) await supabase.from("contratos").update({ status: "assinado" }).eq("id", signatario.contrato_id)
    mutateSignatarios(); mutateContratos(); toast.success("Assinatura registrada.")
  }

  async function excluirContrato() {
    if (!contrato) return
    if (contrato.anexo_path) {
      const { error: storageError } = await supabase.storage.from("erp-legal-contracts").remove([contrato.anexo_path])
      if (storageError) { toast.error("Não foi possível remover o documento privado."); return }
    }
    const { error: deleteError } = await supabase.from("contratos").delete().eq("id", contrato.id)
    if (deleteError) { toast.error("Não foi possível excluir o contrato."); return }
    setSelecionado(null)
    await Promise.all([mutateContratos(), mutateValidacoes(), mutateSignatarios(), mutateLembretes()])
    toast.success("Contrato e registros vinculados excluídos.")
  }

  return <div>
    <PageHeader title="Jurídico" description="Contratos, validação dos sócios e acompanhamento de assinaturas em um só lugar." action={<><Button variant="outline" onClick={gerarExemplosJuridico} disabled={gerandoExemplo}>{gerandoExemplo ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Gerar exemplos</Button><Button onClick={() => setDialogContrato(true)}><Plus className="size-4" />Novo contrato</Button></>} />
    {error && <Card className="mb-5 border-destructive/40"><CardContent className="py-5 text-sm">Aplique a migração <strong>20260801010000_legal_department.sql</strong> no Supabase para habilitar esta área.</CardContent></Card>}
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">{contratos.length === 0 && !error ? <Card><CardContent className="py-10 text-center"><Scale className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-semibold">Nenhum contrato cadastrado</p><p className="mt-1 text-sm text-muted-foreground">Cadastre o primeiro documento do setor jurídico.</p></CardContent></Card> : contratos.map((c) => <button key={c.id} onClick={() => setSelecionado(c.id)} className={`w-full rounded-xl border p-4 text-left transition-colors ${c.id === selecionado ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:bg-muted/50"}`}><div className="flex items-start justify-between gap-2"><p className="font-semibold">{c.titulo}</p><Badge variant="outline">{STATUS[c.status]}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{c.contraparte || "Sem contraparte"}</p>{c.vencimento && <p className="mt-1 text-xs text-muted-foreground">Vence em {new Date(`${c.vencimento}T12:00:00`).toLocaleDateString("pt-BR")}</p>}</button>)}</div>
      {contrato ? <Tabs defaultValue="contrato" className="min-w-0"><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="contrato">Contrato</TabsTrigger><TabsTrigger value="validacao">Validação</TabsTrigger><TabsTrigger value="assinaturas">Assinaturas</TabsTrigger></TabsList>
        <TabsContent value="contrato" className="space-y-4"><Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{contrato.titulo}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{contrato.tipo || "Contrato"} · {contrato.contraparte || "Sem contraparte"}</p></div><div className="flex items-center gap-2"><Badge>{STATUS[contrato.status]}</Badge><ConfirmDeleteButton onConfirm={excluirContrato} label="Excluir contrato" description="O contrato, o documento anexado, as validações, os signatários e o histórico de lembretes serão excluídos definitivamente." /></div></div></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Info label="Responsável" value={contrato.responsavel_nome || "Não definido"} /><Info label="Vencimento" value={contrato.vencimento ? new Date(`${contrato.vencimento}T12:00:00`).toLocaleDateString("pt-BR") : "Sem vencimento"} /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações</p><p className="mt-1 whitespace-pre-wrap text-sm">{contrato.observacoes || "Sem observações."}</p></div><div className="rounded-xl border bg-muted/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><FileText className="size-7 text-primary" /><div><p className="font-medium">{contrato.anexo_nome || "Nenhum documento anexado"}</p><p className="text-xs text-muted-foreground">PDF, DOC ou DOCX · até 10 MB · armazenamento privado</p></div></div><div className="flex gap-2">{contrato.anexo_path && <Button variant="outline" onClick={baixarAnexo}><Download className="size-4" />Abrir</Button>}<Button asChild variant="outline" disabled={saving}><label className="cursor-pointer"><Upload className="size-4" />{contrato.anexo_path ? "Substituir" : "Anexar"}<input className="sr-only" type="file" accept=".pdf,.doc,.docx" onChange={(e) => { const file = e.target.files?.[0]; if (file) substituirAnexo(file); e.currentTarget.value = "" }} /></label></Button></div></div></div></CardContent></Card></TabsContent>
        <TabsContent value="validacao" className="space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" />Validação prévia dos sócios</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">O contrato só é liberado para assinatura depois que todos os sócios selecionados aprovarem.</p>{validacoesContrato.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><p className="text-sm text-muted-foreground">A validação ainda não foi iniciada.</p><Button className="mt-4" onClick={enviarValidacao} disabled={saving || !contrato.anexo_path}>{saving && <Loader2 className="size-4 animate-spin" />}Enviar aos sócios para validar</Button></div> : <div className="space-y-3">{validacoesContrato.map((v) => <div key={v.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{v.socio_nome}</p><p className="text-xs text-muted-foreground">{v.status === "pendente" ? "Aguardando análise" : v.status === "aprovado" ? "Aprovado" : "Solicitou ajustes"}</p></div><div className="flex gap-2">{v.status === "pendente" && podeValidar && <><Button size="sm" variant="outline" onClick={() => validar(v.id, "ajustes")}>Pedir ajustes</Button><Button size="sm" onClick={() => validar(v.id, "aprovado")}><CheckCircle2 className="size-4" />Aprovar</Button></>}<Badge variant={v.status === "aprovado" ? "default" : "secondary"}>{v.status}</Badge></div></div>)}</div>}</CardContent></Card></TabsContent>
        <TabsContent value="assinaturas" className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-heading text-xl font-bold">Signatários e lembretes</h2><p className="text-sm text-muted-foreground">Envios ficam bloqueados até a aprovação dos sócios.</p></div><Button onClick={() => setDialogSignatario(true)} disabled={!['aprovado','assinatura_pendente','assinado'].includes(contrato.status)}><Plus className="size-4" />Signatário</Button></div>{signatariosContrato.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum signatário cadastrado ou contrato ainda não aprovado.</CardContent></Card> : signatariosContrato.map((s) => <Card key={s.id}><CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{s.nome}</p><p className="text-xs text-muted-foreground">{s.email || "Sem e-mail"} · {s.whatsapp || "Sem WhatsApp"}</p><p className="mt-1 text-xs text-muted-foreground">Status: {s.status === "assinado" ? "Assinado" : s.status === "notificado" ? "Lembrete enviado" : "Pendente"}</p></div><div className="flex flex-wrap gap-2">{s.status !== "assinado" && <Button variant="outline" onClick={() => enviarLembrete(s)}><MessageCircle className="size-4" />Enviar lembrete</Button>}{s.status !== "assinado" && <Button onClick={() => marcarAssinado(s)}><FileSignature className="size-4" />Marcar assinado</Button>}</div></CardContent></Card>)}{lembretesContrato.length > 0 && <Card><CardHeader><CardTitle className="text-base">Histórico de lembretes</CardTitle></CardHeader><CardContent className="space-y-2">{lembretesContrato.slice(0, 8).map((l) => <div key={l.id} className="flex items-center justify-between gap-3 text-sm"><span>{l.destinatario_nome} · {l.tipo === "assinatura" ? "assinatura" : "validação"}</span><span className="text-xs text-muted-foreground">{l.status} · {new Date(l.created_at).toLocaleString("pt-BR")}</span></div>)}</CardContent></Card>}</TabsContent>
      </Tabs> : <Card><CardContent className="grid min-h-64 place-items-center text-sm text-muted-foreground">Selecione um contrato.</CardContent></Card>}
    </div>
    <JuridicoDemandas pessoas={pessoas} />
    <JuridicoDocumentos pessoas={pessoas} />
    <section id="lembretes-assinatura" className="mt-8 space-y-4 border-t pt-8">
      <div>
        <div className="flex items-center gap-2"><MessageCircle className="size-5 text-primary" /><h2 className="font-heading text-2xl font-bold">Lembretes de assinatura</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Fila separada com todos os signatários pendentes de contratos já validados pelos sócios.</p>
      </div>
      {pendenciasAssinatura.length === 0 ? <Card><CardContent className="py-10 text-center"><CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-500" /><p className="font-semibold">Nenhuma assinatura pendente</p><p className="mt-1 text-sm text-muted-foreground">Os lembretes aparecerão aqui depois da aprovação dos sócios e do cadastro dos signatários.</p></CardContent></Card> : <div className="grid gap-3 md:grid-cols-2">{pendenciasAssinatura.map(({ signatario, contrato: contratoPendente }) => <Card key={signatario.id}><CardContent className="pt-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{signatario.nome}</p><p className="mt-1 text-sm text-muted-foreground">Contrato: {contratoPendente!.titulo}</p></div><Badge variant="outline">{signatario.status === "notificado" ? "Lembrete enviado" : "Pendente"}</Badge></div><div className="mt-4 space-y-1 text-xs text-muted-foreground"><p>WhatsApp: {signatario.whatsapp || "Não cadastrado"}</p><p>Último lembrete: {signatario.lembrete_enviado_em ? new Date(signatario.lembrete_enviado_em).toLocaleString("pt-BR") : "Nenhum"}</p></div><Button className="mt-4 w-full" variant="outline" onClick={() => enviarLembrete(signatario)}><MessageCircle className="size-4" />Enviar lembrete agora</Button></CardContent></Card>)}</div>}
    </section>
    <Dialog open={dialogContrato} onOpenChange={setDialogContrato}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Novo contrato</DialogTitle></DialogHeader><div className="grid gap-4"><div className="grid gap-1.5"><Label>Título</Label><Input value={formContrato.titulo} onChange={(e) => setFormContrato({ ...formContrato, titulo: e.target.value })} placeholder="Ex.: Contrato de prestação de serviços" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label>Tipo</Label><Select value={formContrato.tipo} onValueChange={(v) => setFormContrato({ ...formContrato, tipo: v ?? "Outro" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><Label>Contraparte</Label><Input value={formContrato.contraparte} onChange={(e) => setFormContrato({ ...formContrato, contraparte: e.target.value })} placeholder="Empresa ou pessoa contratada" /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label>Responsável interno</Label><Select value={formContrato.responsavel_id || "sem"} onValueChange={(v) => setFormContrato({ ...formContrato, responsavel_id: v === "sem" ? "" : v ?? "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem">Não definido</SelectItem>{ativos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><Label>Vencimento</Label><Input type="date" value={formContrato.vencimento} onChange={(e) => setFormContrato({ ...formContrato, vencimento: e.target.value })} /></div></div><div className="grid gap-1.5"><Label>Documento (opcional)</Label><Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">PDF, DOC ou DOCX, até 10 MB.</p></div><div className="grid gap-1.5"><Label>Observações</Label><Textarea rows={4} value={formContrato.observacoes} onChange={(e) => setFormContrato({ ...formContrato, observacoes: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogContrato(false)}>Cancelar</Button><Button onClick={salvarContrato} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Salvar contrato</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={dialogSignatario} onOpenChange={setDialogSignatario}><DialogContent><DialogHeader><DialogTitle>Novo signatário</DialogTitle></DialogHeader><div className="grid gap-4"><div className="grid gap-1.5"><Label>Nome</Label><Input value={formSignatario.nome} onChange={(e) => setFormSignatario({ ...formSignatario, nome: e.target.value })} /></div><div className="grid gap-1.5"><Label>E-mail</Label><Input type="email" value={formSignatario.email} onChange={(e) => setFormSignatario({ ...formSignatario, email: e.target.value })} /></div><div className="grid gap-1.5"><Label>WhatsApp</Label><Input value={formSignatario.whatsapp} onChange={(e) => setFormSignatario({ ...formSignatario, whatsapp: e.target.value })} placeholder="5511999999999" /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogSignatario(false)}>Cancelar</Button><Button onClick={salvarSignatario}>Adicionar</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm">{value}</p></div> }

function criarPdfExemplo() {
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length 103 >>\nstream\nBT /F1 18 Tf 72 720 Td (DOCUMENTO JURIDICO DE EXEMPLO - SALGADOU) Tj 0 -30 Td /F1 11 Tf (Arquivo ficticio sem valor juridico.) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let conteudo = "%PDF-1.4\n"
  const offsets = [0]
  objetos.forEach((objeto, index) => { offsets.push(conteudo.length); conteudo += `${index + 1} 0 obj\n${objeto}\nendobj\n` })
  const xref = conteudo.length
  conteudo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([conteudo], { type: "application/pdf" })
}
