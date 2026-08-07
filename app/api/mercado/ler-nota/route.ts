import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { obterOpenAIInvoiceConfig } from "@/lib/openai/server"

type Insumo = { id: string; nome: string; unidade: string; unidade_alternativa: string | null; fator_unidade_alternativa: number | null }
type ItemExtraido = { descricao: string; codigo: string | null; quantidade: number; unidade: string | null; valor_unitario: number | null; valor_total: number; categoria: string | null }
type DocumentoExtraido = { fornecedor: string | null; cnpj: string | null; data_emissao: string | null; numero_documento: string | null; valor_total: number | null; itens: ItemExtraido[] }
type Mapping = { origem_chave: string; descricao_normalizada: string; insumo_id: string; fator_quantidade: number; categoria: string | null }

const MAX_ARQUIVOS = 8
const MAX_BYTES_TOTAL = 35 * 1024 * 1024

function normalizarTexto(valor: string | null | undefined) {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
}
function somenteDigitos(valor: string | null | undefined) { return String(valor ?? "").replace(/\D/g, "") }
function numero(valor: string | null | undefined) {
  if (valor == null || valor === "") return null
  const raw = String(valor).trim()
  const normalizado = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}
function decodeXml(valor: string) { return valor.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'") }
function tag(bloco: string, nome: string) {
  const valor = bloco.match(new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${nome}>`, "i"))?.[1]
  return valor == null ? null : decodeXml(valor.trim())
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
function extrairXml(xml: string): DocumentoExtraido {
  const emit = xml.match(/<(?:[\w-]+:)?emit(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?emit>/i)?.[1] ?? ""
  const ide = xml.match(/<(?:[\w-]+:)?ide(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?ide>/i)?.[1] ?? ""
  const total = xml.match(/<(?:[\w-]+:)?ICMSTot(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?ICMSTot>/i)?.[1] ?? ""
  const itens: ItemExtraido[] = []
  const re = /<(?:[\w-]+:)?det\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?det>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const prod = m[1].match(/<(?:[\w-]+:)?prod(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?prod>/i)?.[1] ?? m[1]
    const descricao = tag(prod, "xProd") || "Item sem descrição"
    const quantidade = numero(tag(prod, "qCom")) ?? 1
    const valorUnitario = numero(tag(prod, "vUnCom"))
    itens.push({ descricao, codigo: tag(prod, "cProd"), quantidade, unidade: tag(prod, "uCom"), valor_unitario: valorUnitario, valor_total: numero(tag(prod, "vProd")) ?? (valorUnitario != null ? quantidade * valorUnitario : 0), categoria: sugerirCategoria(descricao) })
  }
  const data = tag(ide, "dhEmi") || tag(ide, "dEmi")
  return { fornecedor: tag(emit, "xNome"), cnpj: tag(emit, "CNPJ") || tag(emit, "CPF"), data_emissao: data?.slice(0, 10) ?? null, numero_documento: tag(ide, "nNF"), valor_total: numero(tag(total, "vNF")), itens }
}
function tokenScore(descricao: string, nome: string) {
  const ignorar = new Set(["de", "da", "do", "com", "sem", "pct", "pacote", "un", "kg", "g", "ml", "l"])
  const a = new Set(normalizarTexto(descricao).split(" ").filter((x) => x.length > 1 && !ignorar.has(x)))
  const b = new Set(normalizarTexto(nome).split(" ").filter((x) => x.length > 1 && !ignorar.has(x)))
  if (!a.size || !b.size) return 0
  let comum = 0; for (const x of b) if (a.has(x)) comum += 1
  return comum / b.size
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
function converterMedida(v: number, origem: string, destino: string) {
  if (origem === destino) return v
  if (origem === "g" && destino === "kg") return v / 1000
  if (origem === "kg" && destino === "g") return v * 1000
  if (origem === "ml" && destino === "l") return v / 1000
  if (origem === "l" && destino === "ml") return v * 1000
  return null
}
function quantidadeParaEstoque(item: ItemExtraido, insumo: Insumo | null, fator = 1) {
  if (!insumo) return { quantidade: item.quantidade, unidade: unidadeCanonica(item.unidade) || "un" }
  const origem = unidadeCanonica(item.unidade), destino = unidadeCanonica(insumo.unidade) || insumo.unidade
  if (origem) { const direta = converterMedida(item.quantidade, origem, destino); if (direta != null) return { quantidade: direta * fator, unidade: destino } }
  if (origem && insumo.unidade_alternativa && origem === unidadeCanonica(insumo.unidade_alternativa) && insumo.fator_unidade_alternativa) return { quantidade: item.quantidade * Number(insumo.fator_unidade_alternativa) * fator, unidade: destino }
  const emb = normalizarTexto(item.descricao).match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)(?:\s|$)/i)
  if (emb && (!origem || ["un", "pct", "cx"].includes(origem))) {
    const por = converterMedida(Number(emb[1].replace(",", ".")), unidadeCanonica(emb[2])!, destino)
    if (por != null) return { quantidade: item.quantidade * por * fator, unidade: destino }
  }
  return { quantidade: item.quantidade * fator, unidade: destino }
}
function schemaNota() {
  const ns = { anyOf: [{ type: "string" }, { type: "null" }] }, nn = { anyOf: [{ type: "number" }, { type: "null" }] }
  return { type: "object", additionalProperties: false, required: ["fornecedor", "cnpj", "data_emissao", "numero_documento", "valor_total", "itens"], properties: { fornecedor: ns, cnpj: ns, data_emissao: ns, numero_documento: ns, valor_total: nn, itens: { type: "array", items: { type: "object", additionalProperties: false, required: ["descricao", "codigo", "quantidade", "unidade", "valor_unitario", "valor_total", "categoria"], properties: { descricao: { type: "string" }, codigo: ns, quantidade: { type: "number" }, unidade: ns, valor_unitario: nn, valor_total: { type: "number" }, categoria: ns } } } } }
}
async function extrairComVisao(arquivos: { nome: string; mime: string; bytes: ArrayBuffer }[]) {
  const config = await obterOpenAIInvoiceConfig()
  if (!config.enabled) throw new Error("OPENAI_DESATIVADA")
  if (!config.apiKey) throw new Error("OPENAI_API_KEY_NAO_CONFIGURADA")
  const conteudo: Record<string, unknown>[] = [{ type: "input_text", text: "Leia esta nota/cupom fiscal brasileiro. As imagens podem ser partes sequenciais da mesma nota; não duplique itens em sobreposições. Extraia apenas dados legíveis, sem inventar. Use data YYYY-MM-DD. Classifique cada item entre Proteínas, Laticínios, Massas e farinhas, Óleos e gorduras, Bebidas, Embalagens, Limpeza, Temperos, Molhos ou Outros." }]
  for (const a of arquivos) {
    const dataUrl = `data:${a.mime};base64,${Buffer.from(a.bytes).toString("base64")}`
    conteudo.push(a.mime === "application/pdf" ? { type: "input_file", filename: a.nome, file_data: dataUrl } : { type: "input_image", image_url: dataUrl, detail: "high" })
  }
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: config.model, input: [{ role: "user", content: conteudo }], text: { format: { type: "json_schema", name: "nota_fiscal", strict: true, schema: schemaNota() } }, max_output_tokens: 8000 }), signal: AbortSignal.timeout(60_000) })
  const payload = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok) throw new Error(payload?.error?.message || `Falha no serviço de leitura (${response.status})`)
  let texto = ""
  for (const output of payload.output ?? []) if (output?.type === "message") for (const part of output.content ?? []) if (part?.type === "output_text" && typeof part.text === "string") texto += part.text
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
    if (paths.some((p) => !p.startsWith(prefixo) || p.includes(".."))) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 })

    const arquivos: { nome: string; mime: string; bytes: ArrayBuffer }[] = []
    let totalBytes = 0
    for (const path of paths) {
      const { data, error } = await supabase.storage.from("erp-payment-attachments").download(path)
      if (error || !data) throw new Error("Não foi possível acessar um dos anexos da nota.")
      totalBytes += data.size; if (totalBytes > MAX_BYTES_TOTAL) throw new Error("Os arquivos da nota excedem o limite total de 35 MB.")
      const ext = path.split(".").pop()?.toLowerCase()
      const mime = data.type || (ext === "pdf" ? "application/pdf" : ext === "xml" ? "application/xml" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg")
      arquivos.push({ nome: path.split("/").pop() || `nota.${ext || "jpg"}`, mime, bytes: await data.arrayBuffer() })
    }
    const temXml = arquivos.some((a) => a.mime.includes("xml") || a.nome.toLowerCase().endsWith(".xml")), soXml = arquivos.every((a) => a.mime.includes("xml") || a.nome.toLowerCase().endsWith(".xml"))
    if (temXml && !soXml) return NextResponse.json({ error: "Para evitar duplicidade, não misture XML com fotos/PDF da mesma nota." }, { status: 400 })
    let documento: DocumentoExtraido
    if (soXml) { if (arquivos.length !== 1) return NextResponse.json({ error: "Envie um XML por processamento." }, { status: 400 }); documento = extrairXml(Buffer.from(arquivos[0].bytes).toString("utf8")) }
    else documento = await extrairComVisao(arquivos)

    documento.itens = (documento.itens ?? []).filter((i) => i.descricao && Number(i.quantidade) > 0 && Number(i.valor_total) >= 0)
    if (!documento.itens.length) throw new Error("Nenhum item de compra foi identificado. Tente fotos mais próximas e nítidas.")
    const [{ data: insumos, error: insumosError }, { data: mapeamentos, error: mapsError }] = await Promise.all([
      supabase.from("producao_insumos").select("id,nome,unidade,unidade_alternativa,fator_unidade_alternativa").eq("ativo", true).order("nome"),
      supabase.from("mercado_produto_mapeamentos").select("origem_chave,descricao_normalizada,insumo_id,fator_quantidade,categoria"),
    ])
    if (insumosError) throw insumosError
    if (mapsError && !String(mapsError.message).includes("mercado_produto_mapeamentos")) throw mapsError
    const lista = (insumos ?? []) as Insumo[], porId = new Map(lista.map((i) => [i.id, i])), origemChave = somenteDigitos(documento.cnpj) || normalizarTexto(documento.fornecedor) || "geral"
    const maps = ((mapeamentos ?? []) as Mapping[]).filter((m) => !m.origem_chave || m.origem_chave === origemChave)
    const itens = documento.itens.map((item, index) => {
      const dn = normalizarTexto(item.descricao)
      const mapping = maps.find((m) => m.origem_chave === origemChave && m.descricao_normalizada === dn) || maps.find((m) => !m.origem_chave && m.descricao_normalizada === dn)
      let insumoId = mapping?.insumo_id ?? null, confianca = mapping ? 1 : 0
      if (!insumoId) {
        let melhor: Insumo | null = null, score = 0
        for (const insumo of lista) { const s = tokenScore(item.descricao, insumo.nome); if (s > score) { score = s; melhor = insumo } }
        if (melhor && score >= 0.58) { insumoId = melhor.id; confianca = Math.min(0.9, score) }
      }
      const convertido = quantidadeParaEstoque(item, insumoId ? porId.get(insumoId) ?? null : null, mapping ? Number(mapping.fator_quantidade) || 1 : 1)
      return { id: `${index + 1}-${dn.slice(0, 24)}`, descricao: item.descricao, descricao_normalizada: dn, codigo: item.codigo, quantidade_original: Number(item.quantidade), unidade_original: item.unidade, valor_unitario_original: item.valor_unitario == null ? null : Number(item.valor_unitario), valor_total: Number(item.valor_total), categoria: mapping?.categoria || item.categoria || sugerirCategoria(item.descricao), insumo_id_sugerido: insumoId, confianca, quantidade_estoque: convertido.quantidade, unidade_estoque: convertido.unidade, preco_unitario_estoque: convertido.quantidade > 0 ? Number(item.valor_total) / convertido.quantidade : 0 }
    })
    return NextResponse.json({ documento: { fornecedor: documento.fornecedor, cnpj: documento.cnpj, data_emissao: documento.data_emissao, numero_documento: documento.numero_documento, valor_total: documento.valor_total, origem_chave: origemChave }, itens, fonte: soXml ? "xml" : "visao" })
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Não foi possível ler a nota."
    if (mensagem === "OPENAI_API_KEY_NAO_CONFIGURADA") return NextResponse.json({ error: "Configure a API Key da OpenAI em Configurações. XML continua disponível sem IA.", code: mensagem }, { status: 503 })
    if (mensagem === "OPENAI_DESATIVADA") return NextResponse.json({ error: "A leitura de fotos/PDF por IA está desativada nas Configurações.", code: mensagem }, { status: 503 })
    return NextResponse.json({ error: mensagem }, { status: 500 })
  }
}
