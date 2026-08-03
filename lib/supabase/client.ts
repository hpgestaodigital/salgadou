import { createBrowserClient } from "@supabase/ssr"

let client: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (client) return client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Guard: if env vars are missing, return a dummy client to prevent crashes
  if (!supabaseUrl || !publishableKey) {
    console.warn("[v0] Supabase environment variables are not configured")
    // Return a dummy client that won't crash but won't work either
    return {
      auth: {
        getUser: async () => ({ data: { user: null } }),
        onAuthStateChange: () => ({ data: null, subscription: { unsubscribe: () => {} } }),
        signOut: async () => ({ error: null }),
      },
    } as any
  }

  client = createBrowserClient(
    supabaseUrl,
    publishableKey,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
    },
  )
  return client
}
