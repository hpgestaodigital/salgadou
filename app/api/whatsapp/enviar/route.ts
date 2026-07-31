import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const numero = String(body?.numero ?? "").replace(/\D/g, "")
    const mensagem = String(body?.mensagem ?? "").trim()

    if (!numero || !mensagem) {
      return NextResponse.json({ error: "Número e mensagem são obrigatórios." }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", ["evolution_url", "evolution_instance", "evolution_apikey"])

    if (error) {
      return NextResponse.json({ error: "Erro ao ler configurações." }, { status: 500 })
    }

    const cfg = Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor])) as Record<string, string | null>
    const url = cfg.evolution_url
    const instance = cfg.evolution_instance
    const apikey = cfg.evolution_apikey

    if (!url || !instance || !apikey) {
      return NextResponse.json(
        { error: "Evolution API não configurada. Preencha em Configurações." },
        { status: 400 },
      )
    }

    const endpoint = `${url.replace(/\/$/, "")}/message/sendText/${instance}`
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey,
      },
      body: JSON.stringify({ number: numero, text: mensagem }),
    })

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "")
      console.log("[v0] evolution api erro:", resp.status, detail)
      return NextResponse.json({ error: "Falha ao enviar pela Evolution API." }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.log("[v0] erro rota whatsapp:", e)
    return NextResponse.json({ error: "Erro interno ao processar o envio." }, { status: 500 })
  }
}
