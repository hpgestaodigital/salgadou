"use client"

import { useEffect, useState } from "react"
import { Loader2, MessageCircle, Save, Send, Bell } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
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
  "evolution_apikey",
  "template_escala",
  "template_pagamento_fornecedor",
  "template_pagamento_motoboy",
] as const
type Chave = (typeof CHAVES)[number]

const defaults: Record<Chave, string> = {
  evolution_url: "",
  evolution_instance: "",
  evolution_apikey: "",
  template_escala: "Olá {nome}! Lembrete da Salgadou: você tem escala nesta semana. Confira seus horários.",
  template_pagamento_fornecedor:
    "Olá! Salgadou aqui. Lembrete do pagamento do pedido {pedido} para {fornecedor} no valor de {valor}, com vencimento em {vencimento}.",
  template_pagamento_motoboy:
    "Olá {nome}! Salgadou: fechamento do dia {data} - {entregas} entregas. Total a receber: {total}. PIX: {pix}.",
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

  const conectado = Boolean(values.evolution_url && values.evolution_instance && values.evolution_apikey)

  async function salvar() {
    setSaving(true)
    try {
      const rows = (Object.keys(values) as Chave[]).map((chave) => ({
        chave,
        valor: values[chave],
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase.from("configuracoes").upsert(rows, { onConflict: "chave" })
      if (error) throw error
      toast.success("Configurações salvas.")
    } catch (e) {
      console.log("[v0] erro salvar config:", e)
      toast.error("Erro ao salvar configurações.")
    } finally {
      setSaving(false)
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
              Preencha os dados da sua instância. Os valores ficam salvos no banco e são usados pelo servidor para
              enviar mensagens.
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
                  value={values.evolution_apikey}
                  onChange={(e) => setValues({ ...values, evolution_apikey: e.target.value })}
                  placeholder="••••••••"
                  disabled={loading}
                />
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
              Salve as configurações antes de testar. O envio usa a rota segura do servidor, que lê as credenciais
              salvas — sua API Key não é exposta no navegador.
            </p>
          </CardContent>
        </Card>
      </div>

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
