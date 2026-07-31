import { createServerFn } from "@tanstack/react-start";

/**
 * Cria o usuário master inicial apenas se ainda não existir nenhum usuário interno.
 * A senha inicial vive somente no servidor e nunca é enviada ao navegador.
 */
export const ensureBootstrap = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { count, error } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return { created: false };

  const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: "admin@admin.com",
    password: "admin420",
    email_confirm: true,
    user_metadata: { full_name: "Master Admin" },
  });
  if (createError || !data.user) {
    throw new Error(createError?.message ?? "Falha ao criar usuário master");
  }

  await supabaseAdmin.from("profiles").insert({
    id: data.user.id,
    email: "admin@admin.com",
    full_name: "Master Admin",
    is_partner: true,
  });
  await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: data.user.id, role: "master_admin" });

  return { created: true };
});
