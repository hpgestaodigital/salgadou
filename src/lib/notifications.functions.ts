import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getSettingsRow } = await import("@/lib/evolution.server");
    const row = await getSettingsRow();
    return {
      evolution_url: row?.evolution_url ?? "",
      evolution_instance: row?.evolution_instance ?? "",
      has_api_key: Boolean(row?.evolution_api_key),
      test_phone: row?.test_phone ?? "",
      connection_status: row?.connection_status ?? "desconhecido",
      last_sent_at: row?.last_sent_at ?? null,
      last_error: row?.last_error ?? null,
    };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      evolution_url: string;
      evolution_instance: string;
      evolution_api_key?: string;
      test_phone: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: {
      evolution_url: string | null;
      evolution_instance: string | null;
      test_phone: string | null;
      evolution_api_key?: string;
    } = {
      evolution_url: data.evolution_url.trim() || null,
      evolution_instance: data.evolution_instance.trim() || null,
      test_phone: data.test_phone.trim() || null,
    };
    if (data.evolution_api_key && data.evolution_api_key.trim()) {
      payload.evolution_api_key = data.evolution_api_key.trim();
    }
    const { error } = await supabaseAdmin
      .from("app_settings")
      .update(payload)
      .eq("singleton", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string }) => input)
  .handler(async ({ data }) => {
    const { sendWhatsApp } = await import("@/lib/evolution.server");
    return sendWhatsApp({
      phone: data.phone,
      message: "Salgadou Gestão: mensagem de teste da Evolution API. ✅",
      type: "teste",
      recipientName: "Teste",
    });
  });

/** Envio manual de lembretes a partir das telas do sistema. */
export const sendManualReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      kind: "escala_semanal" | "pagamento_fornecedor" | "pagamento_motoboy";
      id: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsApp, getTemplate, renderTemplate, brl, ptDate } = await import(
      "@/lib/evolution.server"
    );

    const template = await getTemplate(data.kind);
    if (!template?.active) return { ok: false, error: "Modelo inativo ou inexistente" };

    if (data.kind === "escala_semanal") {
      const { data: emp } = await supabaseAdmin
        .from("employees")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (!emp) return { ok: false, error: "Colaborador não encontrado" };
      return sendWhatsApp({
        phone: emp.phone,
        message: renderTemplate(template.body, { nome: emp.name }),
        type: data.kind,
        recipientName: emp.name,
      });
    }

    if (data.kind === "pagamento_fornecedor") {
      const { data: p } = await supabaseAdmin
        .from("supplier_payments")
        .select("*, suppliers(name, phone)")
        .eq("id", data.id)
        .maybeSingle();
      if (!p) return { ok: false, error: "Pagamento não encontrado" };
      return sendWhatsApp({
        phone: p.suppliers?.phone ?? null,
        message: renderTemplate(template.body, {
          pedido: p.description ?? "—",
          fornecedor: p.suppliers?.name ?? "—",
          valor: brl(Number(p.amount)),
          vencimento: ptDate(p.due_date),
        }),
        type: data.kind,
        recipientName: p.suppliers?.name ?? null,
      });
    }

    const { data: cpRow } = await supabaseAdmin
      .from("courier_payments")
      .select("*, couriers(name, phone, pix_key)")
      .eq("id", data.id)
      .maybeSingle();
    if (!cpRow) return { ok: false, error: "Fechamento não encontrado" };
    return sendWhatsApp({
      phone: cpRow.couriers?.phone ?? null,
      message: renderTemplate(template.body, {
        nome: cpRow.couriers?.name ?? "—",
        data: ptDate(cpRow.work_date),
        entregas: String(cpRow.deliveries),
        total: brl(Number(cpRow.fees_amount) + Number(cpRow.daily_amount)),
        pix: cpRow.pix_key ?? cpRow.couriers?.pix_key ?? "—",
      }),
      type: data.kind,
      recipientName: cpRow.couriers?.name ?? null,
    });
  });

export const listTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notification_templates")
      .select("*")
      .order("key");
    if (error) throw new Error(error.message);
    return data;
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; body: string; active: boolean }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("notification_templates")
      .update({ body: data.body, active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notification_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data;
  });
