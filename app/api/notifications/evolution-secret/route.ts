import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPapel } from "@/lib/auth-roles"
import { evolutionApiKeyConfigurada } from "@/lib/evolution/server"

async function administrador() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user && getPapel(user) === "admin"
}

export async function GET() {
  if (!(await administrador())) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
  return NextResponse.json({ configured: await evolutionApiKeyConfigurada(), cronConfigured: Boolean(process.env.CRON_SECRET) })
}

export async function PUT(request: Request) {
  if (!(await administrador())) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
  const body = await request.json().catch(() => null)
  const apiKey = String(body?.apiKey ?? "").trim()
  if (apiKey.length < 8 || apiKey.length > 512) return NextResponse.json({ error: "API Key inválida." }, { status: 400 })
  const { error } = await createAdminClient().rpc("erp_set_evolution_api_key", { secret_value: apiKey })
  if (error) return NextResponse.json({ error: "Não foi possível armazenar a chave com segurança." }, { status: 500 })
  return NextResponse.json({ ok: true })
}
