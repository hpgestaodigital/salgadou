"use client"

import { useEffect, useState } from "react"
import { Loader2, PlugZap, Save } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { isAdmin } from "@/lib/auth-roles"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

type Integracao = {
  id: string
  nome: string
  status: string
  objetivo: string
  observacoes: string | null
}

type ConfigIntegracao = {
  id: "whatsapp_cloud" | "n8n" | "webhook"
  nome: string
  ativo: boolean
  configuracao: Record<string, string>
}

const CONFIG_VAZIA: ConfigIntegracao[] = [
  {
    id: "whatsapp_cloud",
    nome: "WhatsApp Cloud API oficial",
    ativo: false,
    configuracao: {
      phone_number_id: "",
      business_account_id: "",
      app_id: "",
      access_token: "",
      verify_token: "",
      api_version: "v23.0",
    },
  },
  {
    id: "n8n",
    nome: "n8n",
    ativo: false,
    configuracao: { base_url: "", api_key: "", webhook_url: "" },
  },
  {
    id: "webhook",
    nome: "Webhook genérico",
    ativo: false,
    configuracao: { url: "", secret: "" },
  },
]

export function ProductionIntegrationsRoadmap() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [admin, setAdmin] = useState(false)
  const [integracoes, setIntegracoes] = useState<Integracao[]>([])
  const [configs, setConfigs] = useState<ConfigIntegracao[]>(CONFIG_VAZIA)

  useEffect(() => {
    let ativo = true

    async function carregarIntegracoes() {
      const { data: auth } = await supabase.auth.getUser()
      if (!ativo) return
      const usuarioAdmin = isAdmin(auth.user) && (auth.user?.email === "admin@admin.com" || auth.user?.app_metadata?.role === "admin")
      setAdmin(usuarioAdmin)

      const roadmap = await supabase
        .from("producao_integracoes")
        .select("id,nome,status,objetivo,observacoes")
        .order("nome")

      if (!ativo) return
      if (roadmap.error) {
        toast.error("Não foi possível carregar as integrações.")
        setIntegracoes([])
      } else {
        setIntegracoes((roadmap.data ?? []) as Integracao[])
      }

      if (usuarioAdmin) {
        const configuracoes = await supabase
          .from("integracoes_configuracoes")
          .select("id,nome,ativo,configuracao")
          .order("nome")
        if (!ativo) return
        if (configuracoes.error) {
          toast.error("Não foi possível carregar as configurações de integração.")
        } else if (configuracoes.data?.length) {
          setConfigs(configuracoes.data as ConfigIntegracao[])
        }
      }

      setLoading(false)
    }

    void carregarIntegracoes()
    return () => {
      ativo = false
    }
  }, [supabase])

  function alterar(id: ConfigIntegracao["id"], campo: string, valor: string | boolean) {
    setConfigs((atuais) =>
      atuais.map((item) =>
        item.id === id
          ? typeof valor === "boolean"
            ? { ...item, ativo: valor }
            : { ...item, configuracao: { ...item.configuracao, [campo]: valor } }
          : item,
      ),
    )
  }

  async function salvar(item: ConfigIntegracao) {
    setSaving(item.id)
    const { data: auth } = await supabase.auth.getUser()
    const { error } = await supabase
      .from("integracoes_configuracoes")
      .upsert({
        id: item.id,
        nome: item.nome,
        ativo: item.ativo,
        configuracao: item.configuracao,
        updated_at: new Date().toISOString(),
        updated_by: auth.user?.id ?? null,
      })
    setSaving(null)
    if (error) return toast.error("Não foi possível salvar esta integração.")
    toast.success(`${item.nome} salva.`)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 animate-spin" />Carregando integrações...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrações"
        description="Configure os canais externos e acompanhe as integrações planejadas da Salgadou."
      />

      {admin ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {configs.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <PlugZap className="size-5 text-primary" />
                    <CardTitle>{item.nome}</CardTitle>
                  </div>
                  <Switch checked={item.ativo} onCheckedChange={(v) => alterar(item.id, "ativo", v)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {item.id === "whatsapp_cloud" && (
                  <>
                    <Campo label="Phone Number ID" value={item.configuracao.phone_number_id} onChange={(v) => alterar(item.id, "phone_number_id", v)} />
                    <Campo label="WhatsApp Business Account ID" value={item.configuracao.business_account_id} onChange={(v) => alterar(item.id, "business_account_id", v)} />
                    <Campo label="App ID" value={item.configuracao.app_id} onChange={(v) => alterar(item.id, "app_id", v)} />
                    <Campo label="Token de acesso" type="password" value={item.configuracao.access_token} onChange={(v) => alterar(item.id, "access_token", v)} />
                    <Campo label="Token de verificação do webhook" type="password" value={item.configuracao.verify_token} onChange={(v) => alterar(item.id, "verify_token", v)} />
                    <Campo label="Versão da Graph API" value={item.configuracao.api_version} onChange={(v) => alterar(item.id, "api_version", v)} />
                    <p className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                      Callback preparado para: <code>/api/integrations/whatsapp/webhook</code>
                    </p>
                  </>
                )}

                {item.id === "n8n" && (
                  <>
                    <Campo label="URL da instância" placeholder="https://n8n.seudominio.com" value={item.configuracao.base_url} onChange={(v) => alterar(item.id, "base_url", v)} />
                    <Campo label="Chave da API" type="password" value={item.configuracao.api_key} onChange={(v) => alterar(item.id, "api_key", v)} />
                    <Campo label="URL do webhook do fluxo" placeholder="https://.../webhook/..." value={item.configuracao.webhook_url} onChange={(v) => alterar(item.id, "webhook_url", v)} />
                  </>
                )}

                {item.id === "webhook" && (
                  <>
                    <Campo label="URL de destino" placeholder="https://..." value={item.configuracao.url} onChange={(v) => alterar(item.id, "url", v)} />
                    <Campo label="Segredo de autenticação" type="password" value={item.configuracao.secret} onChange={(v) => alterar(item.id, "secret", v)} />
                    <p className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                      Endpoint de recebimento preparado para: <code>/api/integrations/webhook</code>
                    </p>
                  </>
                )}

                <Button className="w-full" onClick={() => salvar(item)} disabled={saving === item.id}>
                  {saving === item.id ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Salvar integração
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            As credenciais e configurações das integrações são visíveis somente para o administrador.
          </CardContent>
        </Card>
      )}

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-5 text-sm">
          <strong>Ativar uma integração não movimenta o estoque automaticamente.</strong>
          <p className="mt-1 text-muted-foreground">
            Cada automação deve ser testada antes de passar a alterar vendas, pagamentos ou produção.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {integracoes.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <PlugZap className="size-5 text-primary" />
                  <CardTitle>{item.nome}</CardTitle>
                </div>
                <Badge variant="outline">{item.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{item.objetivo}</p>
              {item.observacoes && <p className="rounded-lg bg-muted/30 p-3 text-muted-foreground">{item.observacoes}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string
  value?: string
  onChange: (valor: string) => void
  type?: "text" | "password"
  placeholder?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
    </div>
  )
}
