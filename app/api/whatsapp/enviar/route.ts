import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enviarEvolution, evolutionConfigurada } from "@/lib/evolution/server"

const MODULOS_ENVIO = [
  "configuracoes",
  "escala",
  "pagamentos_fornecedores",
  "pagamentos_motoboys",
] as const

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

    const papel = String(auth.user.app_metadata?.role || "colaborador")
    const [{ data: padrao, error: padraoError }, { data: individual, error: individualError }] = await Promise.all([
      supabase
        .from("perfis_permissoes")
        .select("modulo,pode_visualizar")
        .eq("papel", papel)
        .in("modulo", [...MODULOS_ENVIO]),
      supabase
        .from("usuarios_permissoes")
        .select("modulo,pode_visualizar")
        .eq("usuario_id", auth.user.id)
        .in("modulo", [...MODULOS_ENVIO]),
    ])

    if (padraoError || individualError) {
      return NextResponse.json({ error: "Não foi possível validar a permissão de envio." }, { status: 503 })
    }

    const permissoes = new Map<string, boolean>()
    for (const item of padrao ?? []) permissoes.set(item.modulo, item.pode_visualizar)
    for (const item of individual ?? []) permissoes.set(item.modulo, item.pode_visualizar)

    if (![...MODULOS_ENVIO].some((modulo) => permissoes.get(modulo) === true)) {
      return NextResponse.json({ error: "Você não tem permissão para enviar mensagens." }, { status: 403 })
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
    if (!(await evolutionConfigurada(url, instance))) {
      return NextResponse.json(
        { error: "Evolution API não configurada. Preencha em Configurações." },
        { status: 400 },
      )
    }

    await enviarEvolution(numero, mensagem, { url, instance })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Erro na rota de envio do WhatsApp:", error)
    return NextResponse.json({ error: "Erro interno ao processar o envio." }, { status: 500 })
  }
}
