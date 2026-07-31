import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enviarEvolution } from "@/lib/evolution/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const numero = String(body?.numero ?? "").replace(/\D/g, "")
    const mensagem = String(body?.mensagem ?? "").trim()

    if (!/^\d{10,15}$/.test(numero) || !mensagem || mensagem.length > 4000) {
      return NextResponse.json({ error: "Número inválido ou mensagem fora do limite de 4.000 caracteres." }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
    }
    const { data, error } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", ["evolution_url", "evolution_instance"])

    if (error) {
      return NextResponse.json({ error: "Erro ao ler configurações." }, { status: 500 })
    }

    const cfg = Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor])) as Record<string, string | null>
    const url = cfg.evolution_url
    const instance = cfg.evolution_instance
    if (!url || !instance || !process.env.EVOLUTION_API_KEY) {
      return NextResponse.json(
        { error: "Evolution API não configurada. Preencha em Configurações." },
        { status: 400 },
      )
    }

    await enviarEvolution(numero, mensagem, { url, instance })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.log("[v0] erro rota whatsapp:", e)
    return NextResponse.json({ error: "Erro interno ao processar o envio." }, { status: 500 })
  }
}
