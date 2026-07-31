import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ADMIN_EMAIL, isAdmin, type Papel } from "@/lib/auth-roles"

async function exigirAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { ok: isAdmin(user), user }
}

function tratarErroServico(e: unknown) {
  if (e instanceof Error && e.message === "SERVICE_ROLE_MISSING") {
    return NextResponse.json({ error: "A chave de serviço do Supabase não está configurada." }, { status: 500 })
  }
  console.log("[v0] erro api usuarios:", e)
  return NextResponse.json({ error: "Erro ao processar a solicitação." }, { status: 500 })
}

export async function GET() {
  const { ok } = await exigirAdmin()
  if (!ok) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) throw error

    const usuarios = data.users.map((u) => ({
      id: u.id,
      email: u.email,
      nome: (u.user_metadata?.nome as string) || "",
      papel: (u.email === ADMIN_EMAIL ? "admin" : (u.user_metadata?.role as string)) || "colaborador",
      criado_em: u.created_at,
    }))
    return NextResponse.json({ usuarios })
  } catch (e) {
    return tratarErroServico(e)
  }
}

export async function POST(request: Request) {
  const { ok } = await exigirAdmin()
  if (!ok) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })

  try {
    const body = await request.json()
    const email = String(body?.email ?? "").trim().toLowerCase()
    const senha = String(body?.senha ?? "")
    const nome = String(body?.nome ?? "").trim()
    const papel = String(body?.papel ?? "colaborador") as Papel

    if (!email || !senha) {
      return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 })
    }
    if (senha.length < 6) {
      return NextResponse.json({ error: "A senha deve ter ao menos 6 caracteres." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { role: papel, nome },
    })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes("already") || msg.includes("registered")) {
        return NextResponse.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return tratarErroServico(e)
  }
}

export async function DELETE(request: Request) {
  const { ok, user } = await exigirAdmin()
  if (!ok) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID não informado." }, { status: 400 })
    if (id === user?.id) {
      return NextResponse.json({ error: "Você não pode excluir a própria conta." }, { status: 400 })
    }

    const admin = createAdminClient()

    // Não permite excluir o administrador padrão.
    const { data: alvo } = await admin.auth.admin.getUserById(id)
    if (alvo?.user?.email === ADMIN_EMAIL) {
      return NextResponse.json({ error: "O administrador padrão não pode ser excluído." }, { status: 400 })
    }

    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return tratarErroServico(e)
  }
}
