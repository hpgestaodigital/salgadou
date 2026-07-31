import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listInternalUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profiles, error } = await context.supabase
      .from("profiles")
      .select("*")
      .order("full_name");
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("*");

    return (profiles ?? []).map((p) => ({
      ...p,
      role: roles?.find((r) => r.user_id === p.id)?.role ?? "partner",
    }));
  });

async function assertMasterAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "master_admin",
  });
  if (!data) throw new Error("Apenas o Master Admin pode gerenciar usuários.");
}

export const createInternalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      email: string;
      password: string;
      full_name: string;
      phone?: string;
      role: "master_admin" | "partner";
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertMasterAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar usuário");

    await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      email: data.email.trim().toLowerCase(),
      full_name: data.full_name,
      phone: data.phone ?? null,
      is_partner: true,
    });
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: data.role });

    return { ok: true };
  });

export const updateInternalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      full_name: string;
      phone?: string;
      active: boolean;
      role: "master_admin" | "partner";
      password?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertMasterAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.full_name,
        phone: data.phone ?? null,
        active: data.active,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.password && data.password.length >= 6) {
      await supabaseAdmin.auth.admin.updateUserById(data.id, { password: data.password });
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.id, role: data.role });

    return { ok: true };
  });
