import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("integracoes_configuracoes")
      .select("configuracao")
      .eq("id", "whatsapp_cloud")
      .single()

    const verifyToken = String(data?.configuracao?.verify_token ?? "")
    const mode = request.nextUrl.searchParams.get("hub.mode")
    const token = request.nextUrl.searchParams.get("hub.verify_token")
    const challenge = request.nextUrl.searchParams.get("hub.challenge")

    if (mode === "subscribe" && token && verifyToken && token === verifyToken && challenge) {
      return new NextResponse(challenge, { status: 200 })
    }
    return NextResponse.json({ error: "Verificação inválida" }, { status: 403 })
  } catch {
    return NextResponse.json({ error: "Integração não configurada" }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    const supabase = createAdminClient()
    const { error } = await supabase.from("integracoes_eventos").insert({
      origem: "whatsapp_cloud",
      payload,
      headers: Object.fromEntries(request.headers.entries()),
    })
    if (error) throw error
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: "Não foi possível registrar o evento" }, { status: 500 })
  }
}
