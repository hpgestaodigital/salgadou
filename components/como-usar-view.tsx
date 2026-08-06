"use client"

import { useEffect, useMemo, useState } from "react"
import { BookOpenCheck, ExternalLink, Loader2, Pencil, PlayCircle, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { getPapel, isAdmin, type Papel } from "@/lib/auth-roles"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type Publico = "todos" | "colaborador" | "socio"
type FiltroPublico = "meu_perfil" | Publico

type Aula = {
  id: string
  titulo: string
  secao: string
  resumo: string
  video_url: string
  publico: Publico
  ordem: number
  ativo: boolean
  created_at: string
}

const PUBLICO_LABEL: Record<Publico, string> = {
  todos: "Para todos",
  colaborador: "Para colaborador",
  socio: "Para sócio",
}

const FORM_VAZIO = {
  titulo: "",
  secao: "",
  resumo: "",
  video_url: "",
  publico: "todos" as Publico,
  ordem: "0",
  ativo: true,
}

function publicoDoPapel(papel: Papel): Publico {
  return papel === "socio" ? "socio" : "colaborador"
}

function youtubeEmbed(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes("youtu.be")) return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).at(-1)
      if (id) return `https://www.youtube.com/embed/${id}`
    }
  } catch {
    return null
  }
  return null
}

export function ComoUsarView() {
  const supabase = createClient()
  const [aulas, setAulas] = useState<Aula[]>([])
  const [papel, setPapel] = useState<Papel>("colaborador")
  const [admin, setAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState<FiltroPublico>("meu_perfil")
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)

  async function carregar() {
    setLoading(true)
    const [{ data: auth }, resultado] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("como_usar_aulas").select("*").order("ordem").order("secao").order("titulo"),
    ])
    const papelAtual = getPapel(auth.user)
    setPapel(papelAtual)
    setAdmin(isAdmin(auth.user) && (papelAtual === "admin" || auth.user?.email === "admin@admin.com"))
    if (resultado.error) {
      toast.error("Não foi possível carregar as aulas.")
      setAulas([])
    } else {
      setAulas((resultado.data ?? []) as Aula[])
    }
    setLoading(false)
  }

  useEffect(() => {
    void carregar()
  }, [])

  const aulasVisiveis = useMemo(() => {
    const perfil = publicoDoPapel(papel)
    return aulas.filter((aula) => {
      const permitidoPeloPerfil = admin || aula.publico === "todos" || aula.publico === perfil
      const permitidoPeloFiltro =
        filtro === "meu_perfil"
          ? permitidoPeloPerfil
          : aula.publico === filtro
      const texto = `${aula.titulo} ${aula.secao} ${aula.resumo}`.toLowerCase()
      return permitidoPeloPerfil && permitidoPeloFiltro && (!busca.trim() || texto.includes(busca.toLowerCase()))
    })
  }, [aulas, papel, admin, filtro, busca])

  const secoes = useMemo(() => {
    const grupos = new Map<string, Aula[]>()
    for (const aula of aulasVisiveis) grupos.set(aula.secao, [...(grupos.get(aula.secao) ?? []), aula])
    return Array.from(grupos.entries())
  }, [aulasVisiveis])

  function abrirNovo() {
    setEditId(null)
    setForm(FORM_VAZIO)
    setOpen(true)
  }

  function abrirEdicao(aula: Aula) {
    setEditId(aula.id)
    setForm({
      titulo: aula.titulo,
      secao: aula.secao,
      resumo: aula.resumo,
      video_url: aula.video_url,
      publico: aula.publico,
      ordem: String(aula.ordem),
      ativo: aula.ativo,
    })
    setOpen(true)
  }

  async function salvar() {
    if (!form.titulo.trim() || !form.secao.trim() || !form.resumo.trim() || !form.video_url.trim()) {
      return toast.error("Preencha título, seção, resumo e link do vídeo.")
    }
    setSaving(true)
    const payload = {
      titulo: form.titulo.trim(),
      secao: form.secao.trim(),
      resumo: form.resumo.trim(),
      video_url: form.video_url.trim(),
      publico: form.publico,
      ordem: Number(form.ordem) || 0,
      ativo: form.ativo,
      updated_at: new Date().toISOString(),
    }
    const { error } = editId
      ? await supabase.from("como_usar_aulas").update(payload).eq("id", editId)
      : await supabase.from("como_usar_aulas").insert(payload)
    setSaving(false)
    if (error) return toast.error("Não foi possível salvar a aula.")
    toast.success(editId ? "Aula atualizada." : "Aula adicionada.")
    setOpen(false)
    await carregar()
  }

  async function excluir(aula: Aula) {
    if (!window.confirm(`Excluir a aula “${aula.titulo}”?`)) return
    const { error } = await supabase.from("como_usar_aulas").delete().eq("id", aula.id)
    if (error) return toast.error("Não foi possível excluir a aula.")
    toast.success("Aula excluída.")
    await carregar()
  }

  return (
    <div>
      <PageHeader
        title="Como usar"
        description="Videoaulas e resumos para aprender cada área do sistema conforme o seu perfil."
        action={admin ? <Button onClick={abrirNovo}><Plus className="size-4" />Nova aula</Button> : undefined}
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_230px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar aula, seção ou assunto" className="pl-9" />
          </div>
          <Select value={filtro} onValueChange={(value) => setFiltro(value as FiltroPublico)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="meu_perfil">Recomendadas para mim</SelectItem>
              <SelectItem value="todos">Para todos</SelectItem>
              {(admin || papel !== "socio") && <SelectItem value="colaborador">Para colaborador</SelectItem>}
              {(admin || papel === "socio") && <SelectItem value="socio">Para sócio</SelectItem>}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" />Carregando aulas...</CardContent></Card>
      ) : secoes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpenCheck className="mx-auto size-10 text-primary" />
            <h2 className="mt-4 font-heading text-xl font-bold">Nenhuma aula encontrada</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {admin ? "Cadastre a primeira videoaula usando o botão Nova aula." : "Ainda não há conteúdo publicado para este perfil."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {secoes.map(([secao, itens]) => (
            <section key={secao}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-xl font-extrabold">{secao}</h2>
                  <p className="text-sm text-muted-foreground">{itens.length} aula(s)</p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {itens.map((aula) => {
                  const embed = youtubeEmbed(aula.video_url)
                  return (
                    <Card key={aula.id} className="overflow-hidden">
                      {embed ? (
                        <div className="aspect-video bg-black">
                          <iframe src={embed} title={aula.titulo} className="size-full" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                        </div>
                      ) : (
                        <a href={aula.video_url} target="_blank" rel="noreferrer" className="grid aspect-video place-items-center bg-muted/40 text-primary hover:bg-muted/60">
                          <PlayCircle className="size-14" />
                        </a>
                      )}
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Badge variant={aula.publico === "todos" ? "secondary" : "outline"}>{PUBLICO_LABEL[aula.publico]}</Badge>
                            <CardTitle className="mt-3 text-lg">{aula.titulo}</CardTitle>
                          </div>
                          {admin && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => abrirEdicao(aula)} aria-label="Editar aula"><Pencil className="size-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => excluir(aula)} aria-label="Excluir aula" className="text-destructive"><Trash2 className="size-4" /></Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{aula.resumo}</p>
                        <Button asChild variant="outline" className="w-full">
                          <a href={aula.video_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Abrir videoaula</a>
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar aula" : "Nova aula"}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5"><Label>Título</Label><Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Como registrar uma tarefa" /></div>
            <div className="grid gap-1.5"><Label>Seção do sistema</Label><Input value={form.secao} onChange={(e) => setForm({ ...form, secao: e.target.value })} placeholder="Ex.: Kanban" /></div>
            <div className="grid gap-1.5"><Label>Link do vídeo</Label><Input type="url" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://youtube.com/..." /></div>
            <div className="grid gap-1.5"><Label>Resumo</Label><Textarea rows={5} value={form.resumo} onChange={(e) => setForm({ ...form, resumo: e.target.value })} placeholder="Explique o que a pessoa aprenderá nesta aula." /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Público</Label>
                <Select value={form.publico} onValueChange={(value) => setForm({ ...form, publico: value as Publico })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Para todos</SelectItem>
                    <SelectItem value="colaborador">Para colaborador</SelectItem>
                    <SelectItem value="socio">Para sócio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Ordem</Label><Input type="number" min="0" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Salvar aula</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
