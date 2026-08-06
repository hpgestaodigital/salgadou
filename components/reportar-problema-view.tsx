"use client"

import { useEffect, useState } from "react"
import { FileImage, FileVideo, Loader2, Paperclip, Send } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { getNome, getPapel } from "@/lib/auth-roles"
import { formatDateTime } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Relatorio = {
  id: string
  comentario: string
  anexos: string[]
  usuario_nome: string
  usuario_email: string | null
  created_at: string
}

type AnexoAssinado = {
  path: string
  url: string
}

export function ReportarProblemaView() {
  const supabase = createClient()
  const [comentario, setComentario] = useState("")
  const [arquivos, setArquivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [relatorios, setRelatorios] = useState<Relatorio[]>([])
  const [anexosAssinados, setAnexosAssinados] = useState<Record<string, AnexoAssinado[]>>({})
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    let ativo = true

    async function carregarSessao() {
      const { data } = await supabase.auth.getUser()
      if (!ativo || !data.user) return
      const ehAdmin = getPapel(data.user) === "admin"
      setAdmin(ehAdmin)
      if (ehAdmin) await carregarRelatorios()
    }

    void carregarSessao()
    return () => {
      ativo = false
    }
  }, [supabase])

  async function carregarRelatorios() {
    setCarregando(true)
    const { data, error } = await supabase
      .from("relatorios_problemas")
      .select("id, comentario, anexos, usuario_nome, usuario_email, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      toast.error("Não foi possível carregar os relatos.")
      setCarregando(false)
      return
    }

    const lista = (data ?? []) as Relatorio[]
    setRelatorios(lista)

    const assinados: Record<string, AnexoAssinado[]> = {}
    await Promise.all(
      lista.map(async (relatorio) => {
        const itens = await Promise.all(
          (relatorio.anexos ?? []).map(async (path) => {
            const { data: urlData } = await supabase.storage
              .from("relatorios-problemas")
              .createSignedUrl(path, 60 * 60)
            return urlData?.signedUrl ? { path, url: urlData.signedUrl } : null
          }),
        )
        assinados[relatorio.id] = itens.filter(Boolean) as AnexoAssinado[]
      }),
    )
    setAnexosAssinados(assinados)
    setCarregando(false)
  }

  async function enviar() {
    if (!comentario.trim()) return toast.error("Escreva o comentário sobre o problema.")

    setEnviando(true)
    const { data: authData } = await supabase.auth.getUser()
    const usuario = authData.user
    if (!usuario) {
      setEnviando(false)
      return toast.error("Sua sessão expirou. Entre novamente.")
    }

    const caminhos: string[] = []
    try {
      for (const arquivo of arquivos) {
        const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "bin"
        const nomeSeguro = `${crypto.randomUUID()}.${extensao}`
        const path = `${usuario.id}/${nomeSeguro}`
        const { error: uploadError } = await supabase.storage
          .from("relatorios-problemas")
          .upload(path, arquivo, { upsert: false })
        if (uploadError) throw uploadError
        caminhos.push(path)
      }

      const { error: insertError } = await supabase.from("relatorios_problemas").insert({
        comentario: comentario.trim(),
        anexos: caminhos,
        usuario_id: usuario.id,
        usuario_nome: getNome(usuario),
        usuario_email: usuario.email ?? null,
      })
      if (insertError) throw insertError

      setComentario("")
      setArquivos([])
      const input = document.getElementById("relatorio-anexos") as HTMLInputElement | null
      if (input) input.value = ""
      toast.success("Relato enviado.")
      if (admin) await carregarRelatorios()
    } catch (error) {
      if (caminhos.length > 0) {
        await supabase.storage.from("relatorios-problemas").remove(caminhos)
      }
      console.error(error)
      toast.error("Não foi possível enviar o relato.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Reportar problema"
        description="Escreva o que aconteceu e, se precisar, anexe prints ou vídeos."
      />

      <Card className="max-w-2xl">
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-2">
            <Label htmlFor="relatorio-comentario">Comentário</Label>
            <Textarea
              id="relatorio-comentario"
              rows={6}
              value={comentario}
              onChange={(event) => setComentario(event.target.value)}
              placeholder="Conte o que aconteceu..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="relatorio-anexos">Prints ou vídeos (opcional)</Label>
            <input
              id="relatorio-anexos"
              type="file"
              multiple
              accept="image/*,video/mp4,video/webm,video/quicktime"
              onChange={(event) => setArquivos(Array.from(event.target.files ?? []))}
              className="block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            {arquivos.length > 0 && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Paperclip className="size-3.5" />{arquivos.length} arquivo(s) selecionado(s)
              </p>
            )}
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
            <div className="grid h-32 place-items-center"><Loader2 className="size-5 animate-spin" /></div>
          ) : relatorios.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum relato enviado.</CardContent></Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {relatorios.map((relatorio) => (
                <Card key={relatorio.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{relatorio.usuario_nome}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {relatorio.usuario_email ? `${relatorio.usuario_email} · ` : ""}{formatDateTime(relatorio.created_at)}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm">{relatorio.comentario}</p>
                    {(anexosAssinados[relatorio.id]?.length ?? 0) > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {anexosAssinados[relatorio.id].map((anexo) => {
                          const video = /\.(mp4|webm|mov)$/i.test(anexo.path)
                          return (
                            <a
                              key={anexo.path}
                              href={anexo.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                            >
                              {video ? <FileVideo className="size-4" /> : <FileImage className="size-4" />}
                              Abrir {video ? "vídeo" : "print"}
                            </a>
                          )
                        })}
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
