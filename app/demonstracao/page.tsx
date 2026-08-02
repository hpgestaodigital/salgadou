import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdmin } from "@/lib/auth-roles"
import { DemonstracaoView } from "@/components/demonstracao-view"

export default async function DemonstracaoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  if (!isAdmin(user)) redirect("/")
  return <DemonstracaoView />
}
