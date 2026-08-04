import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { enviarEvolution, evolutionConfigurada, normalizarNumeroWhatsapp } from "@/lib/evolution/server"

type Evento = "novo" | "proximo" | "atrasado" | "pendente" | "lancamento"
type Tipo = "fornecedor" | "motoboy" | "tarefa"

type Destino = {
  id: string
  nome: string
  whatsapp: string
  externo?: boolean
}

const brl = (valor: number | null) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor ?? 0)
const dataBR = (data: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${data}T12:00:00Z`))
const normalizar = (valor: string | null | undefined) => (valor ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

function idsConfigurados(valor: string | null | undefined) {
  try {
    const ids = JSON.parse(valor || "[]")
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

function preencherTemplate(template: string, vars: Record<string, string | number | null | undefined>) {
  return template.replace(/\{(\w+)\}/g, (_match, chave: string) => {
    const valor = vars[chave]
    return valor === null || valor === undefined ? "" : String(valor)
  })
}

function deduplicarDestinos(destinos: Destino[]) {
  const mapa = new Map<string, Destino>()
  for (const destino of destinos) {
    try {
      const numero = normalizarNumeroWhatsapp(destino.whatsapp)
      if (!mapa.has(numero)) mapa.set(numero, { ...destino, whatsapp: numero })
    } catch {
      continue
    }
  }
  return [...mapa.values()]
}

export async function notificarRegistro(tipo: Tipo, id: string, evento: Evento, periodo = "") {
  const db = createAdminClient()
  const { data: configRows } = await db.from("configuracoes").select("chave,valor").in("chave", [
    "notificacoes_ativas",
    "evolution_url",
    "evolution_instance",
    "template_pagamento_fornecedor",
    "template_pagamento_motoboy",
    "lembrete_destinatarios_fornecedor",
    "lembrete_fornecedor_incluir_fornecedor",
    "lembrete_destinatarios_motoboy",
  ])
  const config = Object.fromEntries((configRows ?? []).map((item) => [item.chave, item.valor])) as Record<string, string | null>
  if (!(await evolutionConfigurada(config.evolution_url, config.evolution_instance))) return { status: "nao_configurada" }
  if (config.notificacoes_ativas !== "true") return { status: "desativada" }

  const tabela = tipo === "fornecedor" ? "pagamentos_fornecedores" : tipo === "motoboy" ? "pagamentos_motoboys" : "kanban_tarefas"
  const { data: registro, error } = await db.from(tabela).select("*").eq("id", id).single()
  if (error || !registro) return { status: "nao_encontrado" }

  const dedupeKey = `${tipo}:${id}:${evento}:${periodo || new Date().toISOString().slice(0, 10)}`
  const { data: pessoas } = await db
    .from("colaboradores")
    .select("id,nome,whatsapp,tipo,ativo,notificacoes_whatsapp")
    .eq("ativo", true)

  const pessoasValidas = (pessoas ?? []).filter((pessoa) => pessoa.whatsapp && pessoa.notificacoes_whatsapp !== false)
  const socios = pessoasValidas.filter((pessoa) => normalizar(pessoa.tipo) === "socio")
  const destinos: Destino[] = []

  if (tipo === "tarefa") {
    const responsavel = pessoasValidas.find((pessoa) =>
      ((registro.responsavel_id && pessoa.id === registro.responsavel_id) || normalizar(pessoa.nome) === normalizar(registro.responsavel_nome)),
    )
    const internos = responsavel ? [responsavel] : socios
    destinos.push(...internos.map((pessoa) => ({ id: pessoa.id, nome: pessoa.nome, whatsapp: pessoa.whatsapp as string })))
  }

  if (tipo === "fornecedor") {
    const selecionados = new Set(idsConfigurados(config.lembrete_destinatarios_fornecedor))
    for (const responsavelId of registro.responsavel_ids ?? []) selecionados.add(String(responsavelId))
    if (registro.responsavel) {
      pessoasValidas
        .filter((pessoa) => normalizar(pessoa.nome) === normalizar(registro.responsavel))
        .forEach((pessoa) => selecionados.add(pessoa.id))
    }
    let internos = pessoasValidas.filter((pessoa) => selecionados.has(pessoa.id))
    if (!internos.length) internos = socios
    destinos.push(...internos.map((pessoa) => ({ id: pessoa.id, nome: pessoa.nome, whatsapp: pessoa.whatsapp as string })))

    const deveIncluirFornecedor = config.lembrete_fornecedor_incluir_fornecedor !== "false" && evento !== "novo"
    if (deveIncluirFornecedor) {
      const { data: fornecedor } = await db
        .from("fornecedores")
        .select("id,nome,whatsapp")
        .ilike("nome", registro.fornecedor)
        .eq("ativo", true)
        .maybeSingle()
      if (fornecedor?.whatsapp) {
        destinos.push({ id: `fornecedor:${fornecedor.id}`, nome: fornecedor.nome, whatsapp: fornecedor.whatsapp, externo: true })
      }
    }
  }

  if (tipo === "motoboy") {
    const selecionados = new Set(idsConfigurados(config.lembrete_destinatarios_motoboy))
    for (const responsavelId of registro.responsavel_ids ?? []) selecionados.add(String(responsavelId))
    if (registro.responsavel) {
      pessoasValidas
        .filter((pessoa) => normalizar(pessoa.nome) === normalizar(registro.responsavel))
        .forEach((pessoa) => selecionados.add(pessoa.id))
    }
    let internos = pessoasValidas.filter((pessoa) => selecionados.has(pessoa.id))
    if (!internos.length) internos = socios
    destinos.push(...internos.map((pessoa) => ({ id: pessoa.id, nome: pessoa.nome, whatsapp: pessoa.whatsapp as string })))

    if (evento !== "lancamento" && registro.motoboy_id) {
      const { data: motoboy } = await db
        .from("motoboys")
        .select("id,nome,whatsapp")
        .eq("id", registro.motoboy_id)
        .eq("ativo", true)
        .maybeSingle()
      if (motoboy?.whatsapp) {
        destinos.push({ id: `motoboy:${motoboy.id}`, nome: motoboy.nome, whatsapp: motoboy.whatsapp, externo: true })
      }
    }
  }

  const destinosUnicos = deduplicarDestinos(destinos)
  if (!destinosUnicos.length) return { status: "sem_destinatario" }

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

  const templateFornecedor = config.template_pagamento_fornecedor ||
    "Olá! Salgadou aqui. Lembrete do pagamento do pedido {pedido} para {fornecedor} no valor de {valor}, com vencimento em {vencimento}."
  const templateMotoboy = config.template_pagamento_motoboy ||
    "Olá {nome}! Salgadou: fechamento do dia {data} - {entregas} entregas. Total a receber: {total}. PIX: {pix}."

  let enviados = 0
  let falhas = 0
  for (const destino of destinosUnicos) {
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

    const mensagem = tipo === "fornecedor"
      ? preencherTemplate(templateFornecedor, {
          nome: destino.nome,
          fornecedor: registro.fornecedor,
          pedido: registro.pedido || "—",
          valor: brl(registro.valor),
          vencimento: dataBR(registro.vencimento),
        })
      : tipo === "motoboy" && evento !== "lancamento"
        ? preencherTemplate(templateMotoboy, {
            nome: destino.nome,
            motoboy: registro.motoboy_nome || "Motoboy",
            data: dataBR(registro.data),
            entregas: registro.numero_entregas || 0,
            total: brl(registro.total),
            pix: registro.pix || "",
          })
        : `Olá, ${destino.nome}! ${textos[evento]} — Salgadou Gestão`

    try {
      await enviarEvolution(destino.whatsapp, mensagem, {
        url: config.evolution_url,
        instance: config.evolution_instance,
      })
      await db.from("notificacoes_log").update({ status: "enviado", enviado_em: new Date().toISOString() }).eq("dedupe_key", chaveDestino)
      enviados += 1
    } catch (error) {
      await db.from("notificacoes_log").update({ status: "falhou", erro: error instanceof Error ? error.message : "Falha" }).eq("dedupe_key", chaveDestino)
      falhas += 1
    }
  }

  return { status: "processada", enviados, falhas }
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
  for (const pagamento of fornecedores ?? []) {
    const evento = pagamento.vencimento < hoje ? "atrasado" : pagamento.vencimento <= ate ? "proximo" : "pendente"
    await notificarRegistro("fornecedor", pagamento.id, evento, evento === "proximo" ? pagamento.vencimento : periodoSemanal)
  }

  const { data: motoboys } = await db.from("pagamentos_motoboys").select("id,data,pago_em,total,numero_entregas").is("pago_em", null)
  for (const pagamento of motoboys ?? []) {
    const evento = !pagamento.numero_entregas && !pagamento.total ? "lancamento" : pagamento.data < hoje ? "atrasado" : "pendente"
    await notificarRegistro("motoboy", pagamento.id, evento, periodoSemanal)
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

  return {
    fornecedores: fornecedores?.length ?? 0,
    motoboys: motoboys?.length ?? 0,
    tarefas: tarefas?.length ?? 0,
  }
}
