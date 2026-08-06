import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("integracoes_configuracoes")
      .select("ativo,configuracao")
      .eq("id", "webhook")
      .single()

    if (!data?.ativo) return NextResponse.json({ error: "Webhook desativado" }, { status: 403 })

    const segredo = String(data.configuracao?.secret ?? "")
    const recebido = request.headers.get("x-webhook-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || ""
    if (!segredo || recebido !== segredo) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const payload = await request.json()
    const origem = request.headers.get("x-integration-source") || "webhook"
    const { error } = await supabase.from("integracoes_eventos").insert({
      origem,
      payload,
      headers: Object.fromEntries(request.headers.entries()),
    })
    if (error) throw error

    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: "Não foi possível registrar o evento" }, { status: 500 })
  }
}
