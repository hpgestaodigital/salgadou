import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

type EvolutionConfig = { url?: string | null; instance?: string | null }

async function evolutionApiKey() {
  if (process.env.EVOLUTION_API_KEY) return process.env.EVOLUTION_API_KEY
  const { data } = await createAdminClient().rpc("erp_get_evolution_api_key")
  return typeof data === "string" ? data : null
}

function resolverConfig(config?: EvolutionConfig) {
  const url = process.env.EVOLUTION_API_URL || config?.url
  const instance = process.env.EVOLUTION_INSTANCE || config?.instance
  return { url: url?.trim() || null, instance: instance?.trim() || null }
}

function endpointSeguro(url: string) {
  const endpoint = new URL(url)
  if (process.env.NODE_ENV === "production" && endpoint.protocol !== "https:") {
    throw new Error("EVOLUTION_HTTPS_REQUIRED")
  }
  return endpoint.toString().replace(/\/$/, "")
}

export function normalizarNumeroWhatsapp(numero: string) {
  let normalizado = numero.replace(/\D/g, "")
  if ((normalizado.length === 10 || normalizado.length === 11) && !normalizado.startsWith("55")) {
    normalizado = `55${normalizado}`
  }
  if (normalizado.length < 12 || normalizado.length > 15) {
    throw new Error("EVOLUTION_INVALID_PHONE")
  }
  return normalizado
}

export async function evolutionApiKeyConfigurada() {
  return Boolean(await evolutionApiKey())
}

export async function evolutionConfigurada(url?: string | null, instance?: string | null) {
  const config = resolverConfig({ url, instance })
  return Boolean(config.url && config.instance && await evolutionApiKey())
}

export async function obterEstadoEvolution(url?: string | null, instance?: string | null) {
  const config = resolverConfig({ url, instance })
  const apiKey = await evolutionApiKey()
  if (!config.url || !config.instance || !apiKey) {
    return { configured: false, connected: false, state: "not_configured" }
  }

  try {
    const base = endpointSeguro(config.url)
    const response = await fetch(
      `${base}/instance/connectionState/${encodeURIComponent(config.instance)}`,
      {
        method: "GET",
        headers: { apikey: apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!response.ok) {
      return { configured: true, connected: false, state: `http_${response.status}` }
    }
    const payload = await response.json().catch(() => null) as { instance?: { state?: string } } | null
    const state = String(payload?.instance?.state || "unknown").toLowerCase()
    return { configured: true, connected: state === "open", state }
  } catch (error) {
    return {
      configured: true,
      connected: false,
      state: error instanceof Error ? error.message : "unavailable",
    }
  }
}

export async function enviarEvolution(numero: string, mensagem: string, config?: EvolutionConfig) {
  const resolved = resolverConfig(config)
  const apiKey = await evolutionApiKey()
  if (!resolved.url || !resolved.instance || !apiKey) throw new Error("EVOLUTION_NOT_CONFIGURED")

  const numeroNormalizado = normalizarNumeroWhatsapp(numero)
  const texto = mensagem.trim()
  if (!texto || texto.length > 4096) throw new Error("EVOLUTION_INVALID_MESSAGE")

  const base = endpointSeguro(resolved.url)
  const response = await fetch(
    `${base}/message/sendText/${encodeURIComponent(resolved.instance)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        number: numeroNormalizado,
        textMessage: { text: texto },
        delay: 500,
        linkPreview: false,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  )

  if (!response.ok) {
    const detalhe = await response.text().catch(() => "")
    throw new Error(`EVOLUTION_HTTP_${response.status}${detalhe ? `:${detalhe.slice(0, 300)}` : ""}`)
  }

  return response.json().catch(() => ({ status: "sent" }))
}
