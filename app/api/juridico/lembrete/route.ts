import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPapel } from "@/lib/auth-roles"
import { enviarEvolution, evolutionConfigurada } from "@/lib/evolution/server"

type Destinatario = { nome: string; whatsapp: string | null; signatarioId?: string }

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const papel = getPapel(auth.user)
  if (!auth.user || !["admin", "financeiro", "socio", "juridico"].includes(papel)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })

  const body = await request.json().catch(() => null)
  const contratoId = String(body?.contrato_id ?? "")
  const tipo = String(body?.tipo ?? "") as "validacao_socios" | "assinatura"
  const signatarioId = body?.signatario_id ? String(body.signatario_id) : null
  if (!/^[0-9a-f-]{36}$/i.test(contratoId) || !["validacao_socios", "assinatura"].includes(tipo)) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 })

  const { data: contrato } = await supabase.from("contratos").select("id, titulo, status").eq("id", contratoId).single()
  if (!contrato) return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 })

  let destinatarios: Destinatario[] = []
  if (tipo === "validacao_socios") {
    const { data } = await supabase.from("colaboradores").select("nome, whatsapp").eq("ativo", true).eq("tipo", "Sócio")
    destinatarios = (data ?? []).map((p) => ({ nome: p.nome, whatsapp: p.whatsapp }))
  } else {
    if (!signatarioId) return NextResponse.json({ error: "Selecione o signatário." }, { status: 400 })
    const { data } = await supabase.from("contrato_signatarios").select("id, nome, whatsapp").eq("id", signatarioId).eq("contrato_id", contratoId).single()
    if (data) destinatarios = [{ nome: data.nome, whatsapp: data.whatsapp, signatarioId: data.id }]
  }
  if (!destinatarios.length) return NextResponse.json({ error: "Nenhum destinatário disponível." }, { status: 400 })

  const admin = createAdminClient()
  const { data: cfgRows } = await admin.from("configuracoes").select("chave, valor").in("chave", ["evolution_url", "evolution_instance"])
  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.chave, r.valor])) as Record<string, string | null>
  const configurada = await evolutionConfigurada(cfg.evolution_url, cfg.evolution_instance)
  const resultados: Array<{ nome: string; status: string }> = []

  for (const destino of destinatarios) {
    const numero = String(destino.whatsapp ?? "").replace(/\D/g, "")
    let status: "enviado" | "nao_configurado" | "falhou" = configurada ? "falhou" : "nao_configurado"
    let erro: string | null = null
    if (!/^\d{10,15}$/.test(numero)) erro = "WhatsApp não cadastrado ou inválido."
    else if (configurada) {
      try {
        const mensagem = tipo === "validacao_socios"
          ? `Olá, ${destino.nome}. O contrato “${contrato.titulo}” está aguardando sua validação no ERP Salgadou antes de seguir para assinatura.`
          : `Olá, ${destino.nome}. Lembrete: o contrato “${contrato.titulo}” está aguardando sua assinatura. Em caso de dúvida, fale com o setor Jurídico da Salgadou.`
        await enviarEvolution(numero, mensagem, { url: cfg.evolution_url, instance: cfg.evolution_instance })
        status = "enviado"
      } catch { erro = "Falha no envio pelo WhatsApp." }
    } else erro = "Evolution API não configurada no servidor."

    await admin.from("contrato_lembretes").insert({ contrato_id: contratoId, tipo, destinatario_nome: destino.nome, destinatario_whatsapp: numero || null, status, erro, enviado_por: auth.user.id })
    if (status === "enviado" && destino.signatarioId) await supabase.from("contrato_signatarios").update({ status: "notificado", lembrete_enviado_em: new Date().toISOString() }).eq("id", destino.signatarioId)
    resultados.push({ nome: destino.nome, status })
  }

  return NextResponse.json({ ok: resultados.some((r) => r.status === "enviado"), configurada, resultados })
}
