import "server-only"

export function evolutionConfigurada(url?: string | null, instance?: string | null) {
  return Boolean((url || process.env.EVOLUTION_API_URL) && (instance || process.env.EVOLUTION_INSTANCE) && process.env.EVOLUTION_API_KEY)
}

export async function enviarEvolution(numero: string, mensagem: string, config?: { url?: string | null; instance?: string | null }) {
  const url = process.env.EVOLUTION_API_URL || config?.url
  const instance = config?.instance || process.env.EVOLUTION_INSTANCE
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!url || !instance || !apiKey) throw new Error("EVOLUTION_NOT_CONFIGURED")
  if (process.env.NODE_ENV === "production" && !process.env.EVOLUTION_API_URL) {
    throw new Error("EVOLUTION_SERVER_URL_REQUIRED")
  }
  const endpointBase = new URL(url)
  if (process.env.NODE_ENV === "production" && endpointBase.protocol !== "https:") {
    throw new Error("EVOLUTION_HTTPS_REQUIRED")
  }

  const response = await fetch(`${endpointBase.toString().replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: numero.replace(/\D/g, ""), text: mensagem }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`EVOLUTION_HTTP_${response.status}`)
}
