"use client"

import { useEffect, useState } from "react"
import { Bug, FileImage, Loader2, Paperclip, Send, Video } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { getNome, getPapel } from "@/lib/auth-roles"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Anexo = { nome: string; caminho: string; tipo: string }
type Relato = {
  id: string
  comentario: string
  anexos: Anexo[]
  usuario_nome: string
  created_at: string
}

type RelatoComUrls = Relato & { urls: Record<string, string> }

export function ProblemReportsView() {
  const supabase = createClient()
  const [comentario, setComentario] = useState("")
  const [arquivos, setArquivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [relatos, setRelatos] = useState<RelatoComUrls[]>([])
  const [carregando, setCarregando] = useState(true)

  async function carregarRelatos() {
    const { data: auth } = await supabase.auth.getUser()
    const ehAdmin = getPapel(auth.user) === "admin"
    setAdmin(ehAdmin)
    if (!ehAdmin) {
      setCarregando(false)
      return
    }

    const { data, error } = await supabase
      .from("relatos_problemas")
      .select("id,comentario,anexos,usuario_nome,created_at")
      .order("created_at", { ascending: false })

    if (error) {
      toast.error("Não foi possível carregar os relatos.")
      setCarregando(false)
      return
    }

    const comUrls = await Promise.all(
      ((data ?? []) as Relato[]).map(async (relato) => {
        const urls: Record<string, string> = {}
        await Promise.all(
          (relato.anexos ?? []).map(async (anexo) => {
            const { data: signed } = await supabase.storage.from("problem-reports").createSignedUrl(anexo.caminho, 3600)
            if (signed?.signedUrl) urls[anexo.caminho] = signed.signedUrl
          }),
        )
        return { ...relato, urls }
      }),
    )
    setRelatos(comUrls)
    setCarregando(false)
  }

  useEffect(() => {
    void carregarRelatos()
  }, [])

  async function enviar() {
    if (!comentario.trim()) return toast.error("Escreva um comentário sobre o problema.")

    setEnviando(true)
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      setEnviando(false)
      return toast.error("Sua sessão expirou. Entre novamente.")
    }

    const anexos: Anexo[] = []
    for (const arquivo of arquivos) {
      const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "bin"
      const nomeSeguro = `${crypto.randomUUID()}.${extensao}`
      const caminho = `${auth.user.id}/${nomeSeguro}`
      const { error: uploadError } = await supabase.storage.from("problem-reports").upload(caminho, arquivo, {
        contentType: arquivo.type || undefined,
        upsert: false,
      })
      if (uploadError) {
        setEnviando(false)
        return toast.error(`Não foi possível enviar ${arquivo.name}.`)
      }
      anexos.push({ nome: arquivo.name, caminho, tipo: arquivo.type })
    }

    const { error } = await supabase.from("relatos_problemas").insert({
      comentario: comentario.trim(),
      anexos,
      usuario_id: auth.user.id,
      usuario_nome: getNome(auth.user),
    })

    setEnviando(false)
    if (error) return toast.error("Não foi possível enviar o relato.")

    setComentario("")
    setArquivos([])
    const input = document.getElementById("anexos-problema") as HTMLInputElement | null
    if (input) input.value = ""
    toast.success("Relato enviado.")
    if (admin) void carregarRelatos()
  }

  return (
    <div>
      <PageHeader title="Reportar problema" description="Descreva o que aconteceu e, se quiser, anexe prints ou vídeos." />

      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="flex items-center gap-2"><Bug className="size-5 text-primary" />Enviar relato</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="comentario-problema">Comentário</Label>
            <Textarea
              id="comentario-problema"
              rows={6}
              value={comentario}
              onChange={(event) => setComentario(event.target.value)}
              placeholder="Conte o que aconteceu..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="anexos-problema">Prints ou vídeos (opcional)</Label>
            <input
              id="anexos-problema"
              type="file"
              accept="image/*,video/*"
              multiple
              className="block w-full rounded-lg border border-border bg-background p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
              onChange={(event) => setArquivos(Array.from(event.target.files ?? []))}
            />
            {arquivos.length > 0 && <p className="text-xs text-muted-foreground">{arquivos.length} arquivo(s) selecionado(s).</p>}
          </div>
          <Button onClick={enviar} disabled={enviando}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Enviar
          </Button>
        </CardContent>
      </Card>

      {admin && (
        <section className="mt-8">
          <h2 className="mb-4 font-heading text-xl font-bold">Relatos recebidos</h2>
          {carregando ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</div>
          ) : relatos.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum relato recebido.</CardContent></Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {relatos.map((relato) => (
                <Card key={relato.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{relato.usuario_nome}</CardTitle>
                    <p className="text-xs text-muted-foreground">{new Date(relato.created_at).toLocaleString("pt-BR")}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="whitespace-pre-wrap text-sm">{relato.comentario}</p>
                    {(relato.anexos ?? []).length > 0 && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {relato.anexos.map((anexo) => {
                          const url = relato.urls[anexo.caminho]
                          if (!url) return null
                          if (anexo.tipo.startsWith("image/")) {
                            return <a key={anexo.caminho} href={url} target="_blank" rel="noreferrer"><img src={url} alt={anexo.nome} className="max-h-64 w-full rounded-lg border object-contain" /></a>
                          }
                          if (anexo.tipo.startsWith("video/")) {
                            return <video key={anexo.caminho} controls className="max-h-72 w-full rounded-lg border" src={url} />
                          }
                          return <a key={anexo.caminho} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted"><Paperclip className="size-4" />{anexo.nome}</a>
                        })}
                      </div>
                    )}
                    {(relato.anexos ?? []).length > 0 && (
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><FileImage className="size-3.5" />Prints</span>
                        <span className="flex items-center gap-1"><Video className="size-3.5" />Vídeos</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
