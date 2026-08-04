import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enviarEvolution, evolutionConfigurada, normalizarNumeroWhatsapp } from "@/lib/evolution/server"

const CONTEXTOS = {
  escala: "escala",
  pagamento_fornecedor: "pagamentos_fornecedores",
  pagamento_motoboy: "pagamentos_motoboys",
  configuracoes: "configuracoes",
} as const

type Contexto = keyof typeof CONTEXTOS

type MensagemEntrada = {
  numero?: unknown
  mensagem?: unknown
}

function contextoValido(valor: string): valor is Contexto {
  return Object.prototype.hasOwnProperty.call(CONTEXTOS, valor)
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const contextoInformado = String(body?.contexto ?? "")
    const mensagensInformadas = Array.isArray(body?.mensagens) ? body.mensagens as MensagemEntrada[] : []

    if (!contextoValido(contextoInformado) || mensagensInformadas.length < 1 || mensagensInformadas.length > 30) {
      return NextResponse.json({ error: "Contexto inválido ou quantidade de destinatários fora do limite." }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 })

    const modulo = CONTEXTOS[contextoInformado]
    const papel = String(user.app_metadata?.role || "colaborador")
    const [{ data: individual, error: individualError }, { data: padrao, error: padraoError }] = await Promise.all([
      supabase
        .from("usuarios_permissoes")
        .select("pode_visualizar")
        .eq("usuario_id", user.id)
        .eq("modulo", modulo)
        .maybeSingle(),
      supabase
        .from("perfis_permissoes")
        .select("pode_visualizar")
        .eq("papel", papel)
        .eq("modulo", modulo)
        .maybeSingle(),
    ])

    if (individualError || padraoError) {
      return NextResponse.json({ error: "Não foi possível validar a permissão de envio." }, { status: 503 })
    }

    const permitido = individual?.pode_visualizar ?? padrao?.pode_visualizar ?? false
    const gestorEscala = contextoInformado !== "escala" || ["admin", "financeiro", "socio"].includes(papel)
    if (!permitido || !gestorEscala) {
      return NextResponse.json({ error: "Você não possui permissão para este envio." }, { status: 403 })
    }

    const mensagens = new Map<string, string>()
    for (const item of mensagensInformadas) {
      const mensagem = String(item?.mensagem ?? "").trim()
      if (!mensagem || mensagem.length > 4096) {
        return NextResponse.json({ error: "Há uma mensagem vazia ou acima de 4.096 caracteres." }, { status: 400 })
      }
      try {
        const numero = normalizarNumeroWhatsapp(String(item?.numero ?? ""))
        if (!mensagens.has(numero)) mensagens.set(numero, mensagem)
      } catch {
        return NextResponse.json({ error: "Há um número de WhatsApp inválido na seleção." }, { status: 400 })
      }
    }

    const { data: configRows, error: configError } = await supabase
      .from("configuracoes")
      .select("chave,valor")
      .in("chave", ["evolution_url", "evolution_instance"])

    if (configError) {
      return NextResponse.json({ error: "Não foi possível ler a configuração da Evolution API." }, { status: 500 })
    }

    const config = Object.fromEntries((configRows ?? []).map((item) => [item.chave, item.valor])) as Record<string, string | null>
    if (!(await evolutionConfigurada(config.evolution_url, config.evolution_instance))) {
      return NextResponse.json({ error: "Evolution API não configurada." }, { status: 400 })
    }

    let enviados = 0
    const falhas: { numero: string; erro: string }[] = []
    for (const [numero, mensagem] of mensagens) {
      try {
        await enviarEvolution(numero, mensagem, {
          url: config.evolution_url,
          instance: config.evolution_instance,
        })
        enviados += 1
      } catch (error) {
        falhas.push({ numero, erro: error instanceof Error ? error.message : "Falha desconhecida" })
      }
    }

    const status = enviados > 0 ? 200 : 502
    return NextResponse.json(
      { total: mensagens.size, enviados, falhas: falhas.length, detalhes: falhas },
      { status },
    )
  } catch (error) {
    console.error("Erro no envio em lote do WhatsApp:", error)
    return NextResponse.json({ error: "Erro interno ao processar os lembretes." }, { status: 500 })
  }
}
