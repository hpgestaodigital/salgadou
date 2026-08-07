import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { obterOpenAIInvoiceConfig } from "@/lib/openai/server"

type TipoPagamento = "dinheiro" | "pix" | "debito" | "credito" | "outro" | null

type PagamentoDetectado = {
  tipo: TipoPagamento
  detalhe: string | null
  confianca: number
}

function tag(bloco: string, nome: string) {
  const re = new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${nome}>`, "i")
  return bloco.match(re)?.[1]?.trim() ?? null
}

function pagamentoXml(xml: string): PagamentoDetectado {
  const detPag = xml.match(/<(?:[\w-]+:)?detPag\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?detPag>/i)?.[1] ?? ""
  const codigo = tag(detPag, "tPag")
  const mapa: Record<string, Exclude<TipoPagamento, null>> = {
    "01": "dinheiro",
    "03": "credito",
    "04": "debito",
    "17": "pix",
    "99": "outro",
  }
  const tipo = codigo ? mapa[codigo] ?? "outro" : null
  if (!tipo) return { tipo: null, detalhe: null, confianca: 0 }
  const bandeira = tag(detPag, "tBand")
  const autorizacao = tag(detPag, "cAut")
  const detalhe = [tipo.toUpperCase(), bandeira ? `bandeira ${bandeira}` : null, autorizacao ? `aut. ${autorizacao}` : null].filter(Boolean).join(" · ")
  return { tipo, detalhe, confianca: 1 }
}

async function detectarComIA(arquivos: { nome: string; mime: string; bytes: ArrayBuffer }[]): Promise<PagamentoDetectado> {
  const config = await obterOpenAIInvoiceConfig()
  if (!config.enabled || !config.apiKey) return { tipo: null, detalhe: null, confianca: 0 }

  const content: Record<string, unknown>[] = [{
    type: "input_text",
    text: "Identifique SOMENTE a forma de pagamento desta nota/cupom brasileiro. Tipos permitidos: dinheiro, pix, debito, credito, outro ou null. Se houver banco, carteira, bandeira ou indicação do cartão, coloque em detalhe. Não invente informação ilegível.",
  }]
  for (const arquivo of arquivos) {
    const dataUrl = `data:${arquivo.mime};base64,${Buffer.from(arquivo.bytes).toString("base64")}`
    content.push(arquivo.mime === "application/pdf"
      ? { type: "input_file", filename: arquivo.nome, file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl, detail: "high" })
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "pagamento_nota",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["tipo", "detalhe", "confianca"],
            properties: {
              tipo: { anyOf: [{ type: "string", enum: ["dinheiro", "pix", "debito", "credito", "outro"] }, { type: "null" }] },
              detalhe: { anyOf: [{ type: "string" }, { type: "null" }] },
              confianca: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
      },
      max_output_tokens: 400,
    }),
  })
  if (!response.ok) return { tipo: null, detalhe: null, confianca: 0 }
  const payload = await response.json() as any
  let texto = ""
  for (const output of payload.output ?? []) {
    if (output?.type !== "message") continue
    for (const part of output.content ?? []) if (part?.type === "output_text" && typeof part.text === "string") texto += part.text
  }
  if (!texto) return { tipo: null, detalhe: null, confianca: 0 }
  try { return JSON.parse(texto) as PagamentoDetectado } catch { return { tipo: null, detalhe: null, confianca: 0 } }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 })

  const body = await request.json().catch(() => null) as { paths?: string[] } | null
  const paths = Array.from(new Set(body?.paths ?? []))
  if (!paths.length || paths.length > 8) return NextResponse.json({ pagamento: { tipo: null, detalhe: null, confianca: 0 } })
  const prefixo = `purchases/${auth.user.id}/`
  if (paths.some((p) => !p.startsWith(prefixo) || p.includes(".."))) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 })

  const arquivos: { nome: string; mime: string; bytes: ArrayBuffer }[] = []
  for (const path of paths) {
    const { data, error } = await supabase.storage.from("erp-payment-attachments").download(path)
    if (error || !data) continue
    const ext = path.split(".").pop()?.toLowerCase()
    const mime = data.type || (ext === "pdf" ? "application/pdf" : ext === "xml" ? "application/xml" : "image/jpeg")
    arquivos.push({ nome: path.split("/").pop() || "nota", mime, bytes: await data.arrayBuffer() })
  }
  if (!arquivos.length) return NextResponse.json({ pagamento: { tipo: null, detalhe: null, confianca: 0 } })

  const soXml = arquivos.length === 1 && (arquivos[0].mime.includes("xml") || arquivos[0].nome.endsWith(".xml"))
  const pagamento = soXml
    ? pagamentoXml(Buffer.from(arquivos[0].bytes).toString("utf8"))
    : await detectarComIA(arquivos)

  return NextResponse.json({ pagamento })
}
