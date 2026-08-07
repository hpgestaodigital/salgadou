import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPapel } from "@/lib/auth-roles"
import { obterOpenAIInvoiceConfig } from "@/lib/openai/server"

async function isAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return Boolean(user && getPapel(user) === "admin")
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
  try {
    const config = await obterOpenAIInvoiceConfig()
    return NextResponse.json({
      configured: Boolean(config.apiKey),
      enabled: config.enabled,
      model: config.model,
      source: config.source,
    })
  } catch {
    return NextResponse.json({ configured: Boolean(process.env.OPENAI_API_KEY), enabled: true, model: process.env.OPENAI_INVOICE_MODEL || "gpt-4.1-mini", source: process.env.OPENAI_API_KEY ? "env" : "none" })
  }
}

export async function PUT(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
  const body = await request.json().catch(() => null)
  const apiKey = String(body?.apiKey ?? "").trim()
  const model = String(body?.model ?? "gpt-4.1-mini").trim()
  const enabled = body?.enabled !== false

  if (apiKey && (apiKey.length < 20 || apiKey.length > 512)) {
    return NextResponse.json({ error: "API Key inválida." }, { status: 400 })
  }
  if (!model || model.length > 120 || !/^[a-zA-Z0-9._:-]+$/.test(model)) {
    return NextResponse.json({ error: "Nome de modelo inválido." }, { status: 400 })
  }

  const admin = createAdminClient()
  if (apiKey) {
    const { error } = await admin.rpc("erp_set_openai_api_key", { secret_value: apiKey })
    if (error) return NextResponse.json({ error: "Não foi possível armazenar a chave com segurança." }, { status: 500 })
  }

  const { error: configError } = await admin.from("configuracoes").upsert([
    { chave: "openai_invoice_model", valor: model, updated_at: new Date().toISOString() },
    { chave: "openai_invoice_enabled", valor: String(enabled), updated_at: new Date().toISOString() },
  ], { onConflict: "chave" })
  if (configError) return NextResponse.json({ error: "Não foi possível salvar a configuração." }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
  const config = await obterOpenAIInvoiceConfig()
  if (!config.apiKey) return NextResponse.json({ error: "Configure uma API Key primeiro." }, { status: 400 })
  if (!config.enabled) return NextResponse.json({ error: "A integração OpenAI está desativada." }, { status: 400 })

  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(config.model)}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null
      return NextResponse.json({ error: payload?.error?.message || `Falha ao validar (${response.status}).` }, { status: 400 })
    }
    return NextResponse.json({ ok: true, model: config.model })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível conectar à OpenAI." }, { status: 500 })
  }
}
