import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ADMIN_EMAIL } from "@/lib/auth-roles"

const ADMIN_SENHA = "admin420"

// Garante que o usuário administrador padrão exista. Idempotente.
export async function POST() {
  try {
    const admin = createAdminClient()

    // Procura o admin entre os usuários existentes.
    const { data: lista, error: erroLista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (erroLista) throw erroLista

    const existente = lista.users.find((u) => u.email === ADMIN_EMAIL)
    if (existente) {
      return NextResponse.json({ ok: true, criado: false })
    }

    const { error } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_SENHA,
      email_confirm: true,
      user_metadata: { role: "admin", nome: "Administrador" },
    })
    if (error) throw error

    return NextResponse.json({ ok: true, criado: true })
  } catch (e) {
    if (e instanceof Error && e.message === "SERVICE_ROLE_MISSING") {
      return NextResponse.json(
        { error: "A chave de serviço do Supabase não está configurada." },
        { status: 500 },
      )
    }
    console.log("[v0] erro ensure-admin:", e)
    return NextResponse.json({ error: "Falha ao preparar o usuário administrador." }, { status: 500 })
  }
}
