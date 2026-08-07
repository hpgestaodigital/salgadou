"use client"

import { useEffect, useState } from "react"
import { Bot, CheckCircle2, Eye, EyeOff, Loader2, Save, TestTube2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function OpenAISettings() {
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("gpt-4.1-mini")
  const [enabled, setEnabled] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [source, setSource] = useState<"env" | "vault" | "none">("none")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showKey, setShowKey] = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const res = await fetch("/api/openai/config", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha ao carregar")
      setConfigured(Boolean(data.configured))
      setEnabled(data.enabled !== false)
      setModel(data.model || "gpt-4.1-mini")
      setSource(data.source || "none")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar a OpenAI.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void carregar() }, [])

  async function salvar() {
    setSaving(true)
    try {
      const res = await fetch("/api/openai/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() || undefined, model: model.trim(), enabled }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar")
      setApiKey("")
      await carregar()
      toast.success("Configuração da OpenAI salva com segurança.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a OpenAI.")
    } finally {
      setSaving(false)
    }
  }

  async function testar() {
    setTesting(true)
    try {
      const res = await fetch("/api/openai/config", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Falha no teste")
      toast.success(`Conexão com a OpenAI confirmada (${data.model}).`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível conectar à OpenAI.")
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 font-heading"><Bot className="size-5 text-primary" />OpenAI · Leitor de notas</CardTitle>
          {configured ? <Badge className="gap-1"><CheckCircle2 className="size-3" />Configurada</Badge> : <Badge variant="secondary">Não configurada</Badge>}
        </div>
        <CardDescription>A chave é armazenada no Supabase Vault e nunca é exibida novamente. Ela é usada somente no servidor para ler fotos e PDFs das notas.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="openai-key">API Key</Label>
            <div className="flex gap-2">
              <Input id="openai-key" type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={configured ? "Deixe vazio para manter a chave atual" : "sk-..."} autoComplete="new-password" disabled={loading} />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}>{showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button>
            </div>
            <p className="text-xs text-muted-foreground">{source === "env" ? "Há uma chave definida no ambiente do servidor; ela tem prioridade." : source === "vault" ? "A chave atual está protegida no Vault." : "Nenhuma chave configurada."}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="openai-model">Modelo para leitura</Label>
            <Input id="openai-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4.1-mini" disabled={loading} />
            <p className="text-xs text-muted-foreground">Pode ser alterado sem trocar a API Key.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
          <div><p className="text-sm font-medium">Leitura de foto/PDF por IA</p><p className="text-xs text-muted-foreground">XML continua funcionando mesmo com esta opção desativada.</p></div>
          <Button type="button" variant={enabled ? "default" : "outline"} onClick={() => setEnabled((v) => !v)}>{enabled ? "Ativada" : "Desativada"}</Button>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={testar} disabled={testing || saving || !configured || !enabled}>{testing ? <Loader2 className="size-4 animate-spin" /> : <TestTube2 className="size-4" />}Testar conexão</Button>
          <Button type="button" onClick={salvar} disabled={saving || loading}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Salvar OpenAI</Button>
        </div>
      </CardContent>
    </Card>
  )
}
