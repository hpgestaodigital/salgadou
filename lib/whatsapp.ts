// Substitui marcadores {chave} pelos valores informados.
export function preencherTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_m, chave: string) => {
    const v = vars[chave]
    return v === null || v === undefined ? "" : String(v)
  })
}

// Envia uma mensagem pela rota segura do servidor (Evolution API).
export async function enviarWhatsapp(numero: string, mensagem: string): Promise<void> {
  const res = await fetch("/api/whatsapp/enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numero, mensagem }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error || "Falha ao enviar a mensagem.")
  }
}

export const TEMPLATE_KEYS = {
  escala: "template_escala",
  fornecedor: "template_pagamento_fornecedor",
  motoboy: "template_pagamento_motoboy",
} as const
