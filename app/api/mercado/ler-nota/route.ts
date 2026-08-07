import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type Insumo = {
  id: string
  nome: string
  unidade: string
  unidade_alternativa: string | null
  fator_unidade_alternativa: number | null
}

type ItemExtraido = {
  descricao: string
  codigo: string | null
  quantidade: number
  unidade: string | null
  valor_unitario: number | null
  valor_total: number
  categoria: string | null
}

type DocumentoExtraido = {
  fornecedor: string | null
  cnpj: string | null
  data_emissao: string | null
  numero_documento: string | null
  valor_total: number | null
  itens: ItemExtraido[]
}

type Mapping = {
  origem_chave: string
  descricao_normalizada: string
  insumo_id: string
  fator_quantidade: number
  categoria: string | null
}

const MAX_ARQUIVOS = 8
const MAX_BYTES_TOTAL = 35 * 1024 * 1024

function normalizarTexto(valor: string | null | undefined) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function somenteDigitos(valor: string | null | undefined) {
  return String(valor ?? "").replace(/\D/g, "")
}

function numero(valor: string | null | undefined) {
  if (valor == null || valor === "") return null
  const limpo = String(valor).trim().replace(/\./g, "").replace(",", ".")
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

function decodeXml(valor: string) {
  return valor
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function tag(bloco: string, nome: string) {
  const re = new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${nome}>`, "i")
  const valor = bloco.match(re)?.[1]
  return valor == null ? null : decodeXml(valor.trim())
}

function extrairXml(xml: string): DocumentoExtraido {
  const emit = xml.match(/<(?:[\w-]+:)?emit(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?emit>/i)?.[1] ?? ""
  const ide = xml.match(/<(?:[\w-]+:)?ide(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?ide>/i)?.[1] ?? ""
  const total = xml.match(/<(?:[\w-]+:)?ICMSTot(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?ICMSTot>/i)?.[1] ?? ""
  const itens: ItemExtraido[] = []
  const detRe = /<(?:[\w-]+:)?det\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?det>/gi
  let det: RegExpExecArray | null

  while ((det = detRe.exec(xml))) {
    const bloco = det[1]
    const prod = bloco.match(/<(?:[\w-]+:)?prod(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?prod>/i)?.[1] ?? bloco
    const descricao = tag(prod, "xProd") || "Item sem descrição"
    const qtd = numero(tag(prod, "qCom")) ?? 1
    const unit = numero(tag(prod, "vUnCom"))
    const linha = numero(tag(prod, "vProd")) ?? (unit != null ? qtd * unit : 0)
    itens.push({
      descricao,
      codigo: tag(prod, "cProd"),
      quantidade: qtd,
      unidade: tag(prod, "uCom"),
      valor_unitario: unit,
      valor_total: linha,
      categoria: sugerirCategoria(descricao),
    })
  }

  const dataRaw = tag(ide, "dhEmi") || tag(ide, "dEmi")
  return {
    fornecedor: tag(emit, "xNome"),
    cnpj: tag(emit, "CNPJ") || tag(emit, "CPF"),
    data_emissao: dataRaw ? dataRaw.slice(0, 10) : null,
    numero_documento: tag(ide, "nNF"),
    valor_total: numero(tag(total, "vNF")),
    itens,
  }
}

function sugerirCategoria(descricao: string) {
  const t = normalizarTexto(descricao)
  if (/frango|carne|calabresa|linguica|presunto|bacon|peito|sassami/.test(t)) return "Proteínas"
  if (/queijo|mussarela|mucarela|requeij|leite|creme|manteiga/.test(t)) return "Laticínios"
  if (/farinha|trigo|amido|massa|rosca/.test(t)) return "Massas e farinhas"
  if (/oleo|azeite|gordura|margarina/.test(t)) return "Óleos e gorduras"
  if (/coca|guarana|refrigerante|suco|agua/.test(t)) return "Bebidas"
  if (/caixa|embalag|saco|sacola|pote|tampa|copo|guardanapo/.test(t)) return "Embalagens"
  if (/detergente|desinfetante|alcool|sabao|esponja|limpeza|papel toalha/.test(t)) return "Limpeza"
  if (/sal|alho|cebola|tempero|pimenta|oregano|colorau|caldo/.test(t)) return "Temperos"
  if (/molho|ketchup|maionese|mostarda/.test(t)) return "Molhos"
  return "Outros"
}

function tokenScore(descricao: string, nome: string) {
  const ignorar = new Set(["de", "da", "do", "com", "sem", "pct", "pacote", "un", "kg", "g", "ml", "l"])
  const a = new Set(normalizarTexto(descricao).split(" ").filter((x) => x.length > 1 && !ignorar.has(x)))
  const b = new Set(normalizarTexto(nome).split(" ").filter((x) => x.length > 1 && !ignorar.has(x)))
  if (!a.size || !b.size) return 0
  let comum = 0
  for (const x of b) if (a.has(x)) comum += 1
  return comum / Math.max(b.size, 1)
}

function unidadeCanonica(valor: string | null | undefined) {
  const u = normalizarTexto(valor).replace(/\s/g, "")
  if (["kg", "quilo", "quilos"].includes(u)) return "kg"
  if (["g", "gr", "grama", "gramas"].includes(u)) return "g"
  if (["l", "lt", "litro", "litros"].includes(u)) return "l"
  if (["ml", "mililitro", "mililitros"].includes(u)) return "ml"
  if (["un", "und", "unid", "unidade", "unidades"].includes(u)) return "un"
  if (["pct", "pc", "pac", "pacote", "pacotes"].includes(u)) return "pct"
  if (["cx", "caixa", "caixas"].includes(u)) return "cx"
  return u || null
}

function converterMedida(valor: number, origem: string, destino: string) {
  if (origem === destino) return valor
  if (origem === "g" && destino === "kg") return valor / 1000
  if (origem === "kg" && destino === "g") return valor * 1000
  if (origem === "ml" && destino === "l") return valor / 1000
  if (origem === "l" && destino === "ml") return valor * 1000
  return null
}

function quantidadeParaEstoque(item: ItemExtraido, insumo: Insumo | null, fatorMapeado = 1) {
  if (!insumo) return { quantidade: item.quantidade, unidade: unidadeCanonica(item.unidade) || "un" }
  const origem = unidadeCanonica(item.unidade)
  const destino = unidadeCanonica(insumo.unidade) || insumo.unidade

  if (origem) {
    const direta = converterMedida(item.quantidade, origem, destino)
    if (direta != null) return { quantidade: direta * fatorMapeado, unidade: destino }
  }

  if (origem && insumo.unidade_alternativa && origem === unidadeCanonica(insumo.unidade_alternativa) && insumo.fator_unidade_alternativa) {
    return { quantidade: item.quantidade * Number(insumo.fator_unidade_alternativa) * fatorMapeado, unidade: destino }
  }

  // Ex.: 2 UN de FARINHA 5KG -> 10 kg.
  const embalagem = normalizarTexto(item.descricao).match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)(?:\s|$)/i)
  if (embalagem && (!origem || ["un", "pct", "cx"].includes(origem))) {
    const tamanho = Number(embalagem[1].replace(",", "."))
    const medida = unidadeCanonica(embalagem[2])
    if (Number.isFinite(tamanho) && medida) {
      const porEmbalagem = converterMedida(tamanho, medida, destino)
      if (porEmbalagem != null) return { quantidade: item.quantidade * porEmbalagem * fatorMapeado, unidade: destino }
    }
  }

  return { quantidade: item.quantidade * fatorMapeado, unidade: destino }
}

function schemaNota() {
  const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] }
  const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] }
  return {
    type: "object",
    additionalProperties: false,
    required: ["fornecedor", "cnpj", "data_emissao", "numero_documento", "valor_total", "itens"],
    properties: {
      fornecedor: nullableString,
      cnpj: nullableString,
      data_emissao: nullableString,
      numero_documento: nullableString,
      valor_total: nullableNumber,
      itens: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["descricao", "codigo", "quantidade", "unidade", "valor_unitario", "valor_total", "categoria"],
          properties: {
            descricao: { type: "string" },
            codigo: nullableString,
            quantidade: { type: "number" },
            unidade: nullableString,
            valor_unitario: nullableNumber,
            valor_total: { type: "number" },
            categoria: nullableString,
          },
        },
      },
    },
  }
}

async function extrairComVisao(arquivos: { nome: string; mime: string; bytes: ArrayBuffer }[]) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY_NAO_CONFIGURADA")

  const conteudo: Record<string, unknown>[] = [{
    type: "input_text",
    text: [
      "Leia esta nota/cupom fiscal de compra brasileiro.",
      "As imagens podem ser partes sequenciais da MESMA nota comprida; não duplique itens que aparecem na sobreposição entre fotos.",
      "Extraia apenas o que estiver legível. Não invente produto, quantidade ou preço.",
      "Use data_emissao em YYYY-MM-DD quando identificável.",
      "Em valor_total de cada item use o total daquela linha após a quantidade; em valor_unitario use o preço por unidade de compra quando legível.",
      "Classifique cada item preferencialmente em: Proteínas, Laticínios, Massas e farinhas, Óleos e gorduras, Bebidas, Embalagens, Limpeza, Temperos, Molhos ou Outros.",
    ].join("\n"),
  }]

  for (const arquivo of arquivos) {
    const base64 = Buffer.from(arquivo.bytes).toString("base64")
    const dataUrl = `data:${arquivo.mime};base64,${base64}`
    if (arquivo.mime === "application/pdf") {
      conteudo.push({ type: "input_file", filename: arquivo.nome, file_data: dataUrl })
    } else {
      conteudo.push({ type: "input_image", image_url: dataUrl, detail: "high" })
    }
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_INVOICE_MODEL || "gpt-5.6-luna",
      reasoning: { effort: "low" },
      input: [{ role: "user", content: conteudo }],
      text: {
        verbosity: "low",
        format: { type: "json_schema", name: "nota_fiscal", strict: true, schema: schemaNota() },
      },
      max_output_tokens: 8000,
    }),
  })

  const payload = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok) {
    const msg = payload?.error?.message || `Falha no serviço de leitura (${response.status})`
    throw new Error(msg)
  }

  let texto = ""
  for (const output of payload.output ?? []) {
    if (output?.type !== "message") continue
    for (const part of output.content ?? []) {
      if (part?.type === "output_text" && typeof part.text === "string") texto += part.text
    }
  }
  if (!texto) throw new Error("O leitor não retornou dados estruturados.")
  return JSON.parse(texto) as DocumentoExtraido
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 })

  try {
    const body = await request.json() as { paths?: string[] }
    const paths = Array.from(new Set(body.paths ?? []))
    if (!paths.length) return NextResponse.json({ error: "Envie ao menos uma foto, PDF ou XML." }, { status: 400 })
    if (paths.length > MAX_ARQUIVOS) return NextResponse.json({ error: `Envie no máximo ${MAX_ARQUIVOS} arquivos por nota.` }, { status: 400 })

    const prefixo = `purchases/${auth.user.id}/`
    if (paths.some((p) => !p.startsWith(prefixo) || p.includes(".."))) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 })
    }

    const arquivos: { nome: string; mime: string; bytes: ArrayBuffer }[] = []
    let totalBytes = 0
    for (const path of paths) {
      const { data, error } = await supabase.storage.from("erp-payment-attachments").download(path)
      if (error || !data) throw new Error("Não foi possível acessar um dos anexos da nota.")
      totalBytes += data.size
      if (totalBytes > MAX_BYTES_TOTAL) throw new Error("Os arquivos da nota excedem o limite total de 35 MB.")
      const ext = path.split(".").pop()?.toLowerCase()
      const mime = data.type || (ext === "pdf" ? "application/pdf" : ext === "xml" ? "application/xml" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg")
      arquivos.push({ nome: path.split("/").pop() || `nota.${ext || "jpg"}`, mime, bytes: await data.arrayBuffer() })
    }

    const temXml = arquivos.some((a) => a.mime.includes("xml") || a.nome.toLowerCase().endsWith(".xml"))
    const soXml = arquivos.every((a) => a.mime.includes("xml") || a.nome.toLowerCase().endsWith(".xml"))
    if (temXml && !soXml) return NextResponse.json({ error: "Para evitar duplicidade, não misture XML com fotos/PDF da mesma nota." }, { status: 400 })

    let documento: DocumentoExtraido
    if (soXml) {
      if (arquivos.length !== 1) return NextResponse.json({ error: "Envie um XML por processamento." }, { status: 400 })
      documento = extrairXml(Buffer.from(arquivos[0].bytes).toString("utf8"))
    } else {
      documento = await extrairComVisao(arquivos)
    }

    documento.itens = (documento.itens ?? []).filter((i) => i.descricao && Number(i.quantidade) > 0 && Number(i.valor_total) >= 0)
    if (!documento.itens.length) throw new Error("Nenhum item de compra foi identificado. Tente fotos mais próximas e nítidas.")

    const [{ data: insumos, error: insumosError }, { data: mapeamentos, error: mapsError }] = await Promise.all([
      supabase.from("producao_insumos").select("id,nome,unidade,unidade_alternativa,fator_unidade_alternativa").eq("ativo", true).order("nome"),
      supabase.from("mercado_produto_mapeamentos").select("origem_chave,descricao_normalizada,insumo_id,fator_quantidade,categoria"),
    ])
    if (insumosError) throw insumosError
    // Antes da migration ser aplicada, permite visualizar a leitura sem memória persistente.
    if (mapsError && !String(mapsError.message).includes("mercado_produto_mapeamentos")) throw mapsError

    const listaInsumos = (insumos ?? []) as Insumo[]
    const porId = new Map(listaInsumos.map((i) => [i.id, i]))
    const origemChave = somenteDigitos(documento.cnpj) || normalizarTexto(documento.fornecedor) || "geral"
    const maps = ((mapeamentos ?? []) as Mapping[]).filter((m) => !m.origem_chave || m.origem_chave === origemChave)

    const itens = documento.itens.map((item, index) => {
      const descricaoNormalizada = normalizarTexto(item.descricao)
      const mapping = maps.find((m) => m.origem_chave === origemChave && m.descricao_normalizada === descricaoNormalizada)
        || maps.find((m) => !m.origem_chave && m.descricao_normalizada === descricaoNormalizada)

      let insumoId = mapping?.insumo_id ?? null
      let confianca = mapping ? 1 : 0
      if (!insumoId) {
        let melhor: Insumo | null = null
        let melhorScore = 0
        for (const insumo of listaInsumos) {
          const score = tokenScore(item.descricao, insumo.nome)
          if (score > melhorScore) { melhorScore = score; melhor = insumo }
        }
        // Abaixo disso preferimos deixar para conferência em vez de chutar.
        if (melhor && melhorScore >= 0.58) {
          insumoId = melhor.id
          confianca = Math.min(0.9, melhorScore)
        }
      }

      const insumo = insumoId ? porId.get(insumoId) ?? null : null
      const fator = mapping ? Number(mapping.fator_quantidade) || 1 : 1
      const convertido = quantidadeParaEstoque(item, insumo, fator)
      const precoEstoque = convertido.quantidade > 0 ? Number(item.valor_total) / convertido.quantidade : 0

      return {
        id: `${index + 1}-${descricaoNormalizada.slice(0, 24)}`,
        descricao: item.descricao,
        descricao_normalizada: descricaoNormalizada,
        codigo: item.codigo,
        quantidade_original: Number(item.quantidade),
        unidade_original: item.unidade,
        valor_unitario_original: item.valor_unitario == null ? null : Number(item.valor_unitario),
        valor_total: Number(item.valor_total),
        categoria: mapping?.categoria || item.categoria || sugerirCategoria(item.descricao),
        insumo_id_sugerido: insumoId,
        confianca,
        quantidade_estoque: convertido.quantidade,
        unidade_estoque: convertido.unidade,
        preco_unitario_estoque: precoEstoque,
      }
    })

    return NextResponse.json({
      documento: {
        fornecedor: documento.fornecedor,
        cnpj: documento.cnpj,
        data_emissao: documento.data_emissao,
        numero_documento: documento.numero_documento,
        valor_total: documento.valor_total,
        origem_chave: origemChave,
      },
      itens,
      fonte: soXml ? "xml" : "visao",
    })
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Não foi possível ler a nota."
    if (mensagem === "OPENAI_API_KEY_NAO_CONFIGURADA") {
      return NextResponse.json({ error: "A leitura de fotos/PDF ainda precisa da chave OPENAI_API_KEY no servidor. XML já pode ser lido sem IA.", code: mensagem }, { status: 503 })
    }
    return NextResponse.json({ error: mensagem }, { status: 500 })
  }
}
