import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdmin } from "@/lib/auth-roles"
import { GestaoUsuarios } from "@/components/gestao-usuarios"

export default async function UsuariosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")
  if (!isAdmin(user)) redirect("/")

  return <GestaoUsuarios />
}
