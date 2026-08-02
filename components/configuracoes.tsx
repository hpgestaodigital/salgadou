"use client"

import { useEffect, useState } from "react"
import { Bell, Building2, ImageIcon, Loader2, MessageCircle, Save, Send, Upload, UserCircle } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { mensagemErroSupabase } from "@/lib/supabase/friendly-error"
import { getPapel } from "@/lib/auth-roles"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

const CHAVES = [
  "evolution_url",
  "evolution_instance",
  "template_escala",
  "template_pagamento_fornecedor",
  "template_pagamento_motoboy",
  "dashboard_titulo",
  "dashboard_descricao",
  "brand_logo_url",
  "notificacoes_ativas",
  "notificacoes_antecedencia_dias",
] as const
type Chave = (typeof CHAVES)[number]

const defaults: Record<Chave, string> = {
  evolution_url: "",
  evolution_instance: "",
  template_escala: "Olá {nome}! Lembrete da Salgadou: você tem escala nesta semana. Confira seus horários.",
  template_pagamento_fornecedor:
    "Olá! Salgadou aqui. Lembrete do pagamento do pedido {pedido} para {fornecedor} no valor de {valor}, com vencimento em {vencimento}.",
  template_pagamento_motoboy:
    "Olá {nome}! Salgadou: fechamento do dia {data} - {entregas} entregas. Total a receber: {total}. PIX: {pix}.",
  dashboard_titulo: "Painel Geral",
  dashboard_descricao: "Visão consolidada das finanças e operação da Salgadou.",
  brand_logo_url: "",
  notificacoes_ativas: "false",
  notificacoes_antecedencia_dias: "3",
}

const LEMBRETES: { chave: Chave; titulo: string; descricao: string; marcadores: string[] }[] = [
  {
    chave: "template_escala",
    titulo: "Escala semanal",
    descricao: "Enviado aos colaboradores a partir da tela de Escala Semanal.",
    marcadores: ["{nome}"],
  },
  {
    chave: "template_pagamento_fornecedor",
    titulo: "Pagamento de fornecedor",
    descricao: "Enviado a partir da tela de Pagamentos a Fornecedores.",
    marcadores: ["{fornecedor}", "{pedido}", "{valor}", "{vencimento}"],
  },
  {
    chave: "template_pagamento_motoboy",
    titulo: "Pagamento de motoboy",
    descricao: "Enviado a partir da tela de Pagamentos de Motoboys.",
    marcadores: ["{nome}", "{data}", "{entregas}", "{total}", "{pix}"],
  },
]

export function Configuracoes() {
  const supabase = createClient()
  const [values, setValues] = useState<Record<Chave, string>>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testando, setTestando] = useState(false)
  const [numeroTeste, setNumeroTeste] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [userId, setUserId] = useState("")
  const [uploading, setUploading] = useState<"logo" | "avatar" | null>(null)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const [evolutionConfigured, setEvolutionConfigured] = useState(false)
  const [podeAlterarMarca, setPodeAlterarMarca] = useState(false)

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const { data } = await supabase.from("configuracoes").select("*").in("chave", CHAVES as unknown as string[])
      if (!ativo) return
      if (data) {
        const next = { ...defaults }
        data.forEach((row: { chave: string; valor: string | null }) => {
          if (CHAVES.includes(row.chave as Chave)) next[row.chave as Chave] = row.valor ?? ""
        })
        setValues(next)
      }
      setLoading(false)
    })()
    return () => {
      ativo = false
    }
  }, [supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: import("@supabase/supabase-js").User | null } }) => {
      setUserId(data.user?.id ?? "")
      setAvatarUrl(String(data.user?.user_metadata?.avatar_url ?? ""))
      const papel = getPapel(data.user)
      setPodeAlterarMarca(papel === "admin" || papel === "financeiro" || papel === "socio")
    })
  }, [supabase])

  useEffect(() => {
    fetch("/api/notifications/status")
      .then((res) => res.json())
      .then((data) => setEvolutionConfigured(Boolean(data.configured)))
      .catch(() => {})
  }, [])

  const conectado = evolutionConfigured

  async function salvar() {
    setSaving(true)
    try {
      const chavesSalvar = (Object.keys(values) as Chave[]).filter((chave) => podeAlterarMarca || chave !== "brand_logo_url")
      const rows = chavesSalvar.map((chave) => ({
        chave,
        valor: values[chave],
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase.from("configuracoes").upsert(rows, { onConflict: "chave" })
      if (error) throw error
      const status = await fetch("/api/notifications/status").then((res) => res.json()).catch(() => null)
      if (status) setEvolutionConfigured(Boolean(status.configured))
      toast.success("Configurações salvas.")
      window.dispatchEvent(new Event("salgadou:branding-updated"))
    } catch (e) {
      console.log("[v0] erro salvar config:", e)
      toast.error(mensagemErroSupabase(e, "Não foi possível salvar as configurações."))
    } finally {
      setSaving(false)
    }
  }

  async function uploadImagem(file: File, tipo: "logo" | "avatar") {
    const erro = validarImagem(file)
    if (erro) {
      toast.error(erro)
      return
    }
    if (tipo === "avatar" && !userId) {
      toast.error("Entre novamente para alterar o avatar.")
      return
    }
    setUploading(tipo)
    try {
      const extensao = file.name.split(".").pop()?.toLowerCase() || "jpg"
      const caminho =
        tipo === "logo"
          ? `branding/logo-${Date.now()}.${extensao}`
          : `avatars/${userId}/avatar-${Date.now()}.${extensao}`
      const { error } = await supabase.storage.from("erp-media").upload(caminho, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      })
      if (error) throw error
      const { data } = supabase.storage.from("erp-media").getPublicUrl(caminho)
      if (tipo === "logo") {
        setValues((atual) => ({ ...atual, brand_logo_url: data.publicUrl }))
        toast.success("Imagem enviada. Clique em Salvar para aplicar a nova marca.")
      } else {
        await salvarAvatar(data.publicUrl)
      }
    } catch (error) {
      console.error(error)
      const mensagem = error instanceof Error ? error.message.toLowerCase() : ""
      toast.error(
        mensagem.includes("bucket") && mensagem.includes("not found")
          ? "O bucket erp-media ainda não existe. Use uma URL de imagem ou aplique a migração preparada no Supabase."
          : "Não foi possível enviar a imagem. Verifique o arquivo e as permissões do bucket erp-media.",
      )
    } finally {
      setUploading(null)
    }
  }

  async function salvarAvatar(url = avatarUrl) {
    setSavingAvatar(true)
    try {
      const { error } = await supabase.auth.updateUser({ data: { avatar_url: url.trim() || null } })
      if (error) throw error
      setAvatarUrl(url.trim())
      toast.success(url.trim() ? "Avatar atualizado." : "Avatar removido.")
    } catch (error) {
      console.error(error)
      toast.error("Não foi possível atualizar o avatar.")
    } finally {
      setSavingAvatar(false)
    }
  }

  async function enviarTeste() {
    if (!numeroTeste.trim()) {
      toast.error("Informe o número para o teste.")
      return
    }
    setTestando(true)
    try {
      const res = await fetch("/api/whatsapp/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: numeroTeste,
          mensagem: "Mensagem de teste da Salgadou via Evolution API.",
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Falha no envio")
      toast.success("Mensagem de teste enviada.")
    } catch (e) {
      console.log("[v0] erro teste whatsapp:", e)
      toast.error(e instanceof Error ? e.message : "Erro ao enviar.")
    } finally {
      setTestando(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Integração com WhatsApp (Evolution API) e modelos de lembrete."
        action={
          <Button onClick={salvar} disabled={saving || loading}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 font-heading">
                <MessageCircle className="size-5 text-primary" />
                Evolution API
              </CardTitle>
              {conectado ? (
                <Badge className="bg-accent text-accent-foreground">Configurada</Badge>
              ) : (
                <Badge variant="secondary">Não configurada</Badge>
              )}
            </div>
            <CardDescription>
              O endereço e a instância ficam no banco. A API Key permanece somente nos segredos do servidor.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="url">URL do servidor</Label>
              <Input
                id="url"
                value={values.evolution_url}
                onChange={(e) => setValues({ ...values, evolution_url: e.target.value })}
                placeholder="https://sua-evolution.com"
                disabled={loading}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="inst">Nome da instância</Label>
                <Input
                  id="inst"
                  value={values.evolution_instance}
                  onChange={(e) => setValues({ ...values, evolution_instance: e.target.value })}
                  placeholder="salgadou"
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="key">API Key</Label>
                <Input
                  id="key"
                  type="password"
                  value={conectado ? "configurada-no-servidor" : ""}
                  placeholder="Defina EVOLUTION_API_KEY no servidor"
                  disabled
                />
                <p className="text-xs text-muted-foreground">A chave nunca é salva no navegador ou no banco.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading">
              <Send className="size-5 text-primary" />
              Enviar teste
            </CardTitle>
            <CardDescription>Valide a conexão enviando uma mensagem.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="numteste">Número (com DDD)</Label>
              <Input
                id="numteste"
                value={numeroTeste}
                onChange={(e) => setNumeroTeste(e.target.value)}
                placeholder="5511999998888"
              />
            </div>
            <Button onClick={enviarTeste} disabled={testando || !conectado} className="w-full">
              {testando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Enviar mensagem de teste
            </Button>
            <Separator />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Salve o endereço e a instância antes de testar. O envio usa uma rota segura e lê a API Key somente do
              ambiente do servidor.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <Bell className="size-5 text-primary" />
            Notificações automáticas
          </CardTitle>
          <CardDescription>Novos lançamentos, pendências, vencimentos próximos e atrasos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Ativação</Label>
            <Button
              type="button"
              variant={values.notificacoes_ativas === "true" ? "default" : "outline"}
              onClick={() =>
                setValues({
                  ...values,
                  notificacoes_ativas: values.notificacoes_ativas === "true" ? "false" : "true",
                })
              }
              disabled={!conectado}
            >
              {values.notificacoes_ativas === "true" ? "Notificações ativadas" : "Notificações desativadas"}
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dias-antecedencia">Antecedência (dias)</Label>
            <Input
              id="dias-antecedencia"
              type="number"
              min="1"
              max="30"
              value={values.notificacoes_antecedencia_dias}
              onChange={(e) => setValues({ ...values, notificacoes_antecedencia_dias: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            O responsável recebe o aviso. Sem responsável, todos os Sócios ativos com WhatsApp recebem.
          </p>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {podeAlterarMarca && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading">
                <Building2 className="size-5 text-primary" />
                Marca da empresa
              </CardTitle>
              <CardDescription>Use uma URL pública ou envie uma imagem para o logo exibido na barra lateral.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ImagePreview src={values.brand_logo_url || process.env.NEXT_PUBLIC_BRAND_LOGO_URL || ""} fallback="S" alt="Prévia do logo" />
              <div className="grid gap-1.5">
                <Label htmlFor="brand_logo_url">URL da imagem</Label>
                <Input
                  id="brand_logo_url"
                  type="url"
                  value={values.brand_logo_url}
                  onChange={(e) => setValues({ ...values, brand_logo_url: e.target.value })}
                  placeholder="https://exemplo.com/logo.png"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <label className="cursor-pointer">
                    {uploading === "logo" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    Enviar imagem
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={uploading !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) uploadImagem(file, "logo")
                        e.currentTarget.value = ""
                      }}
                    />
                  </label>
                </Button>
                <Button variant="ghost" onClick={() => setValues({ ...values, brand_logo_url: "" })}>Usar imagem local padrão</Button>
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG ou WebP, até 2 MB. Arquivos usam o bucket público <code>erp-media</code>.</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading">
              <UserCircle className="size-5 text-primary" />
              Meu avatar
            </CardTitle>
            <CardDescription>Personalize a foto exibida junto ao seu perfil na navegação.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ImagePreview src={avatarUrl} fallback="EU" alt="Prévia do avatar" />
            <div className="grid gap-1.5">
              <Label htmlFor="avatar_url">URL da imagem</Label>
              <Input
                id="avatar_url"
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://exemplo.com/minha-foto.jpg"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => salvarAvatar()} disabled={savingAvatar}>
                {savingAvatar && <Loader2 className="size-4 animate-spin" />}Salvar avatar
              </Button>
              <Button asChild variant="outline">
                <label className="cursor-pointer">
                  {uploading === "avatar" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  Enviar imagem
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={uploading !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) uploadImagem(file, "avatar")
                      e.currentTarget.value = ""
                    }}
                  />
                </label>
              </Button>
              <Button variant="ghost" onClick={() => salvarAvatar("")}>Remover</Button>
            </div>
            <p className="text-xs text-muted-foreground">Sem imagem, o sistema mostra suas iniciais.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="font-heading">Conteúdo do dashboard</CardTitle>
          <CardDescription>Personalize o título e a descrição apresentados no painel principal.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="dashboard_titulo">Título</Label>
            <Input
              id="dashboard_titulo"
              value={values.dashboard_titulo}
              onChange={(e) => setValues({ ...values, dashboard_titulo: e.target.value })}
              disabled={loading}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dashboard_descricao">Descrição</Label>
            <Input
              id="dashboard_descricao"
              value={values.dashboard_descricao}
              onChange={(e) => setValues({ ...values, dashboard_descricao: e.target.value })}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <Bell className="size-5 text-primary" />
            Modelos de lembrete
          </CardTitle>
          <CardDescription>
            Personalize a mensagem de cada tipo de lembrete. Use os marcadores indicados — eles são substituídos
            automaticamente no envio.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-3">
          {LEMBRETES.map((l) => (
            <div key={l.chave} className="grid gap-2">
              <div>
                <Label htmlFor={l.chave} className="font-heading">
                  {l.titulo}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">{l.descricao}</p>
              </div>
              <Textarea
                id={l.chave}
                value={values[l.chave]}
                onChange={(e) => setValues({ ...values, [l.chave]: e.target.value })}
                rows={5}
                disabled={loading}
              />
              <div className="flex flex-wrap gap-1.5">
                {l.marcadores.map((m) => (
                  <Badge key={m} variant="outline" className="font-mono text-[11px]">
                    {m}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function validarImagem(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Use uma imagem JPG, PNG ou WebP."
  if (file.size > 2 * 1024 * 1024) return "A imagem deve ter no máximo 2 MB."
  return null
}

function ImagePreview({ src, fallback, alt }: { src: string; fallback: string; alt: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-4">
      <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary text-xl font-black text-primary-foreground">
        {src ? <img src={src} alt={alt} className="size-full object-cover" /> : fallback}
      </span>
      <div>
        <p className="flex items-center gap-2 font-semibold"><ImageIcon className="size-4 text-primary" />Pré-visualização</p>
        <p className="mt-1 text-xs text-muted-foreground">A imagem é recortada para preencher o espaço.</p>
      </div>
    </div>
  )
}
