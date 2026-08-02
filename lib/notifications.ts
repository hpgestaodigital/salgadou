import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { enviarEvolution, evolutionConfigurada } from "@/lib/evolution/server"

type Evento = "novo" | "proximo" | "atrasado" | "pendente" | "lancamento"
type Tipo = "fornecedor" | "motoboy" | "tarefa"

const brl = (valor: number | null) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor ?? 0)
const dataBR = (data: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${data}T12:00:00Z`))
const normalizar = (valor: string | null | undefined) => (valor ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export async function notificarRegistro(tipo: Tipo, id: string, evento: Evento, periodo = "") {
  const db = createAdminClient()
  const { data: configRows } = await db.from("configuracoes").select("chave,valor").in("chave", ["notificacoes_ativas", "evolution_url", "evolution_instance"])
  const config = Object.fromEntries((configRows ?? []).map((item) => [item.chave, item.valor]))
  if (!evolutionConfigurada(config.evolution_url, config.evolution_instance)) return { status: "nao_configurada" }
  if (config.notificacoes_ativas !== "true") return { status: "desativada" }

  const tabela = tipo === "fornecedor" ? "pagamentos_fornecedores" : tipo === "motoboy" ? "pagamentos_motoboys" : "kanban_tarefas"
  const { data: registro, error } = await db.from(tabela).select("*").eq("id", id).single()
  if (error || !registro) return { status: "nao_encontrado" }
  const dedupeKey = `${tipo}:${id}:${evento}:${periodo || new Date().toISOString().slice(0, 10)}`
  const { data: pessoas } = await db.from("colaboradores").select("id,nome, whatsapp, tipo, ativo, notificacoes_whatsapp").eq("ativo", true)
  const nomeResponsavel = tipo === "tarefa" ? registro.responsavel_nome : registro.responsavel
  const responsavel = pessoas?.find((p) =>
    ((tipo === "tarefa" && registro.responsavel_id && p.id === registro.responsavel_id) || normalizar(p.nome) === normalizar(nomeResponsavel))
    && p.whatsapp && p.notificacoes_whatsapp,
  )
  const socios = (pessoas ?? []).filter((p) => normalizar(p.tipo) === "socio" && p.whatsapp && p.notificacoes_whatsapp)
  const destinos = responsavel ? [responsavel] : socios
  if (!destinos.length) return { status: "sem_destinatario" }

  const assunto = tipo === "fornecedor"
    ? `${registro.fornecedor}${registro.pedido ? ` (pedido ${registro.pedido})` : ""}`
    : tipo === "motoboy" ? registro.motoboy_nome || "motoboy" : `tarefa “${registro.titulo}”`
  const data = tipo === "fornecedor" ? registro.vencimento : tipo === "motoboy" ? registro.data : registro.prazo
  const valor = tipo === "fornecedor" ? registro.valor : tipo === "motoboy" ? registro.total : null
  const valorTexto = tipo === "tarefa" ? "" : `, ${brl(valor)}`
  const textos: Record<Evento, string> = {
    novo: `Novo lançamento: ${assunto}${valorTexto}${data ? `, data ${dataBR(data)}` : ""}.`,
    proximo: `${tipo === "tarefa" ? "Prazo" : "Vencimento"} próximo: ${assunto}${valorTexto}, em ${dataBR(data)}.`,
    atrasado: `Atenção: ${tipo === "tarefa" ? "prazo vencido de" : "pagamento atrasado de"} ${assunto}${valorTexto}, desde ${dataBR(data)}.`,
    pendente: `${tipo === "tarefa" ? "Tarefa" : "Pagamento"} pendente: ${assunto}${valorTexto}${data ? `, referência ${dataBR(data)}` : ""}.`,
    lancamento: `Lançamento pendente: complete os dados do pagamento de ${assunto}, referência ${dataBR(data)}.`,
  }

  for (const destino of destinos) {
    const chaveDestino = `${dedupeKey}:${destino.whatsapp}`
    const { data: existente } = await db.from("notificacoes_log").select("status").eq("dedupe_key", chaveDestino).maybeSingle()
    if (existente?.status === "enviado") continue
    await db.from("notificacoes_log").upsert({
      dedupe_key: chaveDestino,
      evento,
      referencia_tipo: tipo,
      referencia_id: id,
      destinatario_nome: destino.nome,
      destinatario_numero: destino.whatsapp,
      status: "processando",
      erro: null,
    }, { onConflict: "dedupe_key" })
    try {
      await enviarEvolution(destino.whatsapp, `Olá, ${destino.nome}! ${textos[evento]} — Salgadou Gestão`, {
        url: config.evolution_url,
        instance: config.evolution_instance,
      })
      await db.from("notificacoes_log").update({ status: "enviado", enviado_em: new Date().toISOString() }).eq("dedupe_key", chaveDestino)
    } catch (e) {
      await db.from("notificacoes_log").update({ status: "falhou", erro: e instanceof Error ? e.message : "Falha" }).eq("dedupe_key", chaveDestino)
    }
  }
  return { status: "processada" }
}

export async function processarNotificacoesAgendadas() {
  const db = createAdminClient()
  const hoje = new Date().toISOString().slice(0, 10)
  const { data: cfg } = await db.from("configuracoes").select("valor").eq("chave", "notificacoes_antecedencia_dias").maybeSingle()
  const limite = new Date(`${hoje}T12:00:00Z`)
  limite.setUTCDate(limite.getUTCDate() + Math.max(1, Number(cfg?.valor) || 3))
  const ate = limite.toISOString().slice(0, 10)
  const inicioSemana = new Date(`${hoje}T12:00:00Z`)
  inicioSemana.setUTCDate(inicioSemana.getUTCDate() - ((inicioSemana.getUTCDay() + 6) % 7))
  const periodoSemanal = inicioSemana.toISOString().slice(0, 10)

  const { data: fornecedores } = await db.from("pagamentos_fornecedores").select("id,vencimento,pago_em").is("pago_em", null)
  for (const p of fornecedores ?? []) {
    const evento = p.vencimento < hoje ? "atrasado" : p.vencimento <= ate ? "proximo" : "pendente"
    await notificarRegistro("fornecedor", p.id, evento, evento === "proximo" ? p.vencimento : periodoSemanal)
  }

  const { data: motoboys } = await db.from("pagamentos_motoboys").select("id,data,pago_em,total,numero_entregas").is("pago_em", null)
  for (const p of motoboys ?? []) {
    const evento = !p.numero_entregas && !p.total ? "lancamento" : p.data < hoje ? "atrasado" : "pendente"
    await notificarRegistro("motoboy", p.id, evento, periodoSemanal)
  }
  const { data: tarefas } = await db
    .from("kanban_tarefas")
    .select("id,prazo,status")
    .neq("status", "concluido")
    .not("prazo", "is", null)
  for (const tarefa of tarefas ?? []) {
    const evento = tarefa.prazo < hoje ? "atrasado" : tarefa.prazo <= ate ? "proximo" : "pendente"
    await notificarRegistro("tarefa", tarefa.id, evento, evento === "proximo" ? tarefa.prazo : periodoSemanal)
  }
  return { fornecedores: fornecedores?.length ?? 0, motoboys: motoboys?.length ?? 0, tarefas: tarefas?.length ?? 0 }
}
