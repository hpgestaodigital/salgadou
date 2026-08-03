import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const novaSenha = String(body?.novaSenha ?? "")
    if (novaSenha.length < 8 || novaSenha.length > 128) {
      return NextResponse.json(
        { error: "A nova senha deve possuir entre 8 e 128 caracteres." },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 },
      )
    }

    const admin = createAdminClient()
    const { data: usuarioAtual, error: usuarioError } =
      await admin.auth.admin.getUserById(user.id)

    if (usuarioError || !usuarioAtual.user) {
      return NextResponse.json(
        { error: "Não foi possível localizar o usuário." },
        { status: 404 },
      )
    }

    const appMetadata = usuarioAtual.user.app_metadata ?? {}
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: novaSenha,
      app_metadata: {
        ...appMetadata,
        must_change_password: false,
      },
    })

    if (updateError) throw updateError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Erro ao concluir troca de senha:", error)
    return NextResponse.json(
      { error: "Não foi possível concluir a troca de senha." },
      { status: 500 },
    )
  }
}
