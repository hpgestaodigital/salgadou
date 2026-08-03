import { createBrowserClient } from "@supabase/ssr"

let client: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (client) return client
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
    },
  )
  return client
}
