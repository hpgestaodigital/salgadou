import { createClient } from "@supabase/supabase-js"

/**
 * Cliente com a service role key. USO EXCLUSIVO NO SERVIDOR.
 * Ignora RLS, então nunca importe isto em código de cliente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error("SERVICE_ROLE_MISSING")
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
