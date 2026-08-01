"use client"

import { useMemo, useState } from "react"
import { Download, FileArchive, FileText, Loader2, Plus, Search, Upload } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mensagemErroSupabase } from "@/lib/supabase/friendly-error"
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

type DocumentoJuridico = {
  id: string
  demanda_id: string | null
  titulo: string
  categoria: string
  descricao: string | null
  data_documento: string | null
  referencia: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  anexo_path: string
  anexo_nome: string
  anexo_mime: string | null
  anexo_tamanho: number | null
  created_at: string
}

const CATEGORIAS = ["Procuração", "Parecer jurídico", "Notificação", "Ata", "Licença e alvará", "Documento societário", "Processo", "Outro"]
const vazio = { titulo: "", categoria: "Parecer jurídico", descricao: "", data_documento: "", referencia: "", responsavel_id: "" }

export function JuridicoDocumentos({ pessoas }: { pessoas: Colaborador[] }) {
  const supabase = createClient()
  const { data: documentos, error, mutate } = useTable<DocumentoJuridico>("documentos_juridicos", { column: "created_at", ascending: false })
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState(vazio)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [busca, setBusca] = useState("")
  const [salvando, setSalvando] = useState(false)
  const ativos = pessoas.filter((p) => p.ativo)
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR")
    if (!termo) return documentos
    return documentos.filter((d) => [d.titulo, d.categoria, d.referencia, d.responsavel_nome].some((valor) => valor?.toLocaleLowerCase("pt-BR").includes(termo)))
  }, [busca, documentos])

  function validarArquivo(file: File) {
    const tipos = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    if (!tipos.includes(file.type)) return "Use PDF, DOC ou DOCX."
    if (file.size > 10 * 1024 * 1024) return "O arquivo deve ter no máximo 10 MB."
    return null
  }

  async function salvar() {
    if (!form.titulo.trim()) return toast.error("Informe o título do documento.")
    if (!arquivo) return toast.error("Selecione o arquivo do documento.")
    const erroArquivo = validarArquivo(arquivo)
    if (erroArquivo) return toast.error(erroArquivo)
    setSalvando(true)
    let path: string | null = null
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("Sua sessão expirou. Entre novamente.")
      const ext = arquivo.name.split(".").pop()?.toLowerCase() || "pdf"
      const documentoId = crypto.randomUUID()
      path = `documents/${auth.user.id}/${documentoId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from("erp-legal-contracts").upload(path, arquivo, { contentType: arquivo.type, upsert: false })
      if (uploadError) throw uploadError
      const responsavel = ativos.find((p) => p.id === form.responsavel_id)
      const { error: insertError } = await supabase.from("documentos_juridicos").insert({
        id: documentoId,
        titulo: form.titulo.trim(),
        categoria: form.categoria,
        descricao: form.descricao.trim() || null,
        data_documento: form.data_documento || null,
        referencia: form.referencia.trim() || null,
        responsavel_id: responsavel?.id ?? null,
        responsavel_nome: responsavel?.nome ?? null,
        anexo_path: path,
        anexo_nome: arquivo.name,
        anexo_mime: arquivo.type,
        anexo_tamanho: arquivo.size,
      })
      if (insertError) throw insertError
      setAberto(false)
      setArquivo(null)
      setForm(vazio)
      await mutate()
      toast.success("Documento jurídico arquivado.")
    } catch (e) {
      if (path) await supabase.storage.from("erp-legal-contracts").remove([path])
      toast.error(mensagemErroSupabase(e, "Não foi possível salvar. Aplique a atualização de documentos jurídicos no Supabase."))
    } finally {
      setSalvando(false)
    }
  }

  async function abrir(documento: DocumentoJuridico) {
    const { data, error: signedError } = await supabase.storage.from("erp-legal-contracts").createSignedUrl(documento.anexo_path, 60)
    if (signedError) return toast.error("Não foi possível abrir o documento.")
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  async function excluir(documento: DocumentoJuridico): Promise<void> {
    const { error: storageError } = await supabase.storage.from("erp-legal-contracts").remove([documento.anexo_path])
    if (storageError) { toast.error("Não foi possível remover o arquivo privado."); return }
    const { error: deleteError } = await supabase.from("documentos_juridicos").delete().eq("id", documento.id)
    if (deleteError) { toast.error("O arquivo foi removido, mas o cadastro não pôde ser excluído."); return }
    await mutate()
    toast.success("Documento excluído.")
  }

  return <section id="documentos-juridicos" className="mt-8 space-y-4 border-t pt-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><FileArchive className="size-5 text-primary" /><h2 className="font-heading text-2xl font-bold">Documentos jurídicos</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Arquivos jurídicos que não são contratos, organizados em uma área própria e privada.</p>
      </div>
      <Button onClick={() => setAberto(true)}><Plus className="size-4" />Novo documento</Button>
    </div>
    {error ? <Card className="border-destructive/40"><CardContent className="py-5 text-sm">Aplique a atualização de documentos jurídicos no Supabase para habilitar esta área.</CardContent></Card> : <>
      {documentos.length > 0 && <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título, categoria ou responsável" /></div>}
      {documentos.length === 0 ? <Card><CardContent className="py-10 text-center"><FileText className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-semibold">Nenhum documento arquivado</p><p className="mt-1 text-sm text-muted-foreground">Guarde aqui procurações, pareceres, notificações, atas e outros documentos.</p></CardContent></Card> : visiveis.length === 0 ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum documento corresponde à busca.</CardContent></Card> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visiveis.map((documento) => <Card key={documento.id}><CardContent className="pt-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Badge variant="outline">{documento.categoria}</Badge><p className="mt-3 truncate font-semibold" title={documento.titulo}>{documento.titulo}</p><p className="mt-1 truncate text-xs text-muted-foreground">{documento.anexo_nome}</p></div><ConfirmDeleteButton onConfirm={() => excluir(documento)} label="Excluir documento" description="O cadastro e o arquivo privado serão excluídos definitivamente." /></div><div className="mt-4 space-y-1 text-xs text-muted-foreground"><p>Responsável: {documento.responsavel_nome || "Não definido"}</p><p>Data: {documento.data_documento ? new Date(`${documento.data_documento}T12:00:00`).toLocaleDateString("pt-BR") : "Não informada"}</p>{documento.referencia && <p>Referência: {documento.referencia}</p>}</div>{documento.descricao && <p className="mt-3 line-clamp-2 text-sm">{documento.descricao}</p>}<Button className="mt-4 w-full" variant="outline" onClick={() => abrir(documento)}><Download className="size-4" />Abrir documento</Button></CardContent></Card>)}</div>}
    </>}
    <Dialog open={aberto} onOpenChange={setAberto}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Novo documento jurídico</DialogTitle></DialogHeader><div className="grid gap-4"><div className="grid gap-1.5"><Label>Título</Label><Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Procuração para representação administrativa" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label>Categoria</Label><Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v ?? "Outro" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIAS.map((categoria) => <SelectItem key={categoria} value={categoria}>{categoria}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><Label>Data do documento</Label><Input type="date" value={form.data_documento} onChange={(e) => setForm({ ...form, data_documento: e.target.value })} /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label>Responsável interno</Label><Select value={form.responsavel_id || "sem"} onValueChange={(v) => setForm({ ...form, responsavel_id: v === "sem" ? "" : v ?? "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem">Não definido</SelectItem>{ativos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-1.5"><Label>Número ou referência</Label><Input value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} placeholder="Ex.: Processo 0001234-56" /></div></div><div className="grid gap-1.5"><Label>Arquivo</Label><Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground"><Upload className="mr-1 inline size-3" />PDF, DOC ou DOCX, até 10 MB. O acesso é privado.</p></div><div className="grid gap-1.5"><Label>Descrição ou observações</Label><Textarea rows={4} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Contexto, providências ou informações importantes sobre o documento" /></div></div><DialogFooter><Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="size-4 animate-spin" />}Salvar documento</Button></DialogFooter></DialogContent></Dialog>
  </section>
}
