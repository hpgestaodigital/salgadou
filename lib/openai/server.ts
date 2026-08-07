import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

export type OpenAIInvoiceConfig = {
  apiKey: string | null
  model: string
  enabled: boolean
  source: "env" | "vault" | "none"
}

export async function obterOpenAIInvoiceConfig(): Promise<OpenAIInvoiceConfig> {
  const admin = createAdminClient()
  const [{ data: rows }, { data: vaultKey }] = await Promise.all([
    admin.from("configuracoes").select("chave,valor").in("chave", ["openai_invoice_model", "openai_invoice_enabled"]),
    admin.rpc("erp_get_openai_api_key"),
  ])

  const mapa = new Map((rows ?? []).map((row: { chave: string; valor: string | null }) => [row.chave, row.valor ?? ""]))
  const envKey = process.env.OPENAI_API_KEY?.trim() || null
  const savedKey = typeof vaultKey === "string" && vaultKey.trim() ? vaultKey.trim() : null

  return {
    apiKey: envKey || savedKey,
    model: process.env.OPENAI_INVOICE_MODEL?.trim() || mapa.get("openai_invoice_model")?.trim() || "gpt-4.1-mini",
    enabled: (mapa.get("openai_invoice_enabled") ?? "true") !== "false",
    source: envKey ? "env" : savedKey ? "vault" : "none",
  }
}

export async function openAIConfigurada() {
  const config = await obterOpenAIInvoiceConfig()
  return Boolean(config.apiKey && config.enabled)
}
