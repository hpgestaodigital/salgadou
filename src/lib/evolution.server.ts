import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function normalizePhone(raw: string | null | undefined) {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return null;
  if (!digits.startsWith("55")) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

export function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{(\w+)\}/g, (_m, key: string) => vars[key] ?? `{${key}}`);
}

export async function getSettingsRow() {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getTemplate(key: string) {
  const { data } = await supabaseAdmin
    .from("notification_templates")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  return data;
}

type SendArgs = {
  phone: string | null;
  message: string;
  type: string;
  recipientName?: string | null;
  dedupeKey?: string | null;
};

export async function sendWhatsApp({
  phone,
  message,
  type,
  recipientName,
  dedupeKey,
}: SendArgs) {
  const normalized = normalizePhone(phone);

  async function log(status: string, error: string | null) {
    await supabaseAdmin.from("notification_logs").insert({
      recipient_name: recipientName ?? null,
      phone: normalized ?? phone ?? null,
      type,
      message,
      status,
      error,
      dedupe_key: dedupeKey ?? null,
      sent_at: status === "enviado" ? new Date().toISOString() : null,
    });
  }

  if (dedupeKey) {
    const { data: existing } = await supabaseAdmin
      .from("notification_logs")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .eq("status", "enviado")
      .maybeSingle();
    if (existing) return { ok: true, skipped: true as const };
  }

  if (!normalized) {
    await log("erro", "Telefone inválido ou ausente");
    return { ok: false, error: "Telefone inválido ou ausente" };
  }

  const settings = await getSettingsRow();
  if (!settings?.evolution_url || !settings.evolution_instance || !settings.evolution_api_key) {
    await log("erro", "Evolution API não configurada");
    return { ok: false, error: "Evolution API não configurada" };
  }

  const url = `${settings.evolution_url.replace(/\/$/, "")}/message/sendText/${settings.evolution_instance}`;
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: settings.evolution_api_key,
        },
        body: JSON.stringify({ number: normalized, text: message }),
      });
      if (res.ok) {
        await log("enviado", null);
        await supabaseAdmin
          .from("app_settings")
          .update({
            connection_status: "conectado",
            last_sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("singleton", true);
        return { ok: true };
      }
      lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Erro desconhecido";
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
  }

  await log("erro", lastError);
  await supabaseAdmin
    .from("app_settings")
    .update({ connection_status: "erro", last_error: lastError })
    .eq("singleton", true);
  return { ok: false, error: lastError };
}

export function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
}

export function ptDate(value?: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
