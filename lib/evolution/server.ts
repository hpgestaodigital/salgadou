import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

async function evolutionApiKey() {
  if (process.env.EVOLUTION_API_KEY) return process.env.EVOLUTION_API_KEY
  const { data } = await createAdminClient().rpc("erp_get_evolution_api_key")
  return typeof data === "string" ? data : null
}

export async function evolutionApiKeyConfigurada() {
  return Boolean(await evolutionApiKey())
}

export async function evolutionConfigurada(url?: string | null, instance?: string | null) {
  return Boolean((url || process.env.EVOLUTION_API_URL) && (instance || process.env.EVOLUTION_INSTANCE) && await evolutionApiKey())
}

export async function enviarEvolution(numero: string, mensagem: string, config?: { url?: string | null; instance?: string | null }) {
  const url = process.env.EVOLUTION_API_URL || config?.url
  const instance = config?.instance || process.env.EVOLUTION_INSTANCE
  const apiKey = await evolutionApiKey()
  if (!url || !instance || !apiKey) throw new Error("EVOLUTION_NOT_CONFIGURED")
  if (process.env.NODE_ENV === "production" && !process.env.EVOLUTION_API_URL) {
    throw new Error("EVOLUTION_SERVER_URL_REQUIRED")
  }
  const endpointBase = new URL(url)
  if (process.env.NODE_ENV === "production" && endpointBase.protocol !== "https:") {
    throw new Error("EVOLUTION_HTTPS_REQUIRED")
  }
  let numeroNormalizado = numero.replace(/\D/g, "")
  if ((numeroNormalizado.length === 10 || numeroNormalizado.length === 11) && !numeroNormalizado.startsWith("55")) {
    numeroNormalizado = `55${numeroNormalizado}`
  }
  if (numeroNormalizado.length < 12 || numeroNormalizado.length > 15) {
    throw new Error("EVOLUTION_INVALID_PHONE")
  }
  if (!mensagem.trim() || mensagem.length > 4096) throw new Error("EVOLUTION_INVALID_MESSAGE")

  const response = await fetch(`${endpointBase.toString().replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: numeroNormalizado, text: mensagem.trim() }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`EVOLUTION_HTTP_${response.status}`)
}
