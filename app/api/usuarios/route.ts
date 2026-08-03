import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ADMIN_EMAIL, getPapel, type Papel } from "@/lib/auth-roles"

async function exigirGestorAcesso() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, user: null, papel: "colaborador" as Papel }

  const papel = getPapel(user)
  const [{ data: individual, error: individualError }, { data: padrao, error: padraoError }] = await Promise.all([
    supabase
      .from("usuarios_permissoes")
      .select("pode_visualizar")
      .eq("usuario_id", user.id)
      .eq("modulo", "usuarios")
      .maybeSingle(),
    supabase
      .from("perfis_permissoes")
      .select("pode_visualizar")
      .eq("papel", papel)
      .eq("modulo", "usuarios")
      .maybeSingle(),
  ])

  if (individualError || padraoError) return { ok: false, user, papel }

  const permitido = individual?.pode_visualizar ?? padrao?.pode_visualizar ?? false
  return { ok: Boolean(permitido), user, papel }
}

function tratarErroServico(e: unknown) {
  if (e instanceof Error && e.message === "SERVICE_ROLE_MISSING") {
    return NextResponse.json(
      {
        error: "A gestão de usuários ainda não está habilitada neste ambiente.",
        code: "ADMIN_SERVICE_NOT_CONFIGURED",
      },
      { status: 503 },
    )
  }
  console.error("Erro na API de usuários:", e)
  return NextResponse.json({ error: "Erro ao processar a solicitação." }, { status: 500 })
}

export async function GET() {
  const { ok } = await exigirGestorAcesso()
  if (!ok) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })

  try {
    const admin = createAdminClient()
    const [{ data, error }, { data: vinculos, error: vinculosError }] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from("usuarios_vinculos").select("usuario_id, colaborador_id"),
    ])
    if (error) throw error
    if (vinculosError && !["42P01", "PGRST205"].includes(vinculosError.code)) throw vinculosError

    const usuarios = data.users.map((u) => ({
      id: u.id,
      email: u.email,
      nome: (u.user_metadata?.nome as string) || "",
      papel: (u.email === ADMIN_EMAIL ? "admin" : (u.app_metadata?.role as string)) || "colaborador",
      criado_em: u.created_at,
      colaborador_id: vinculos?.find((v) => v.usuario_id === u.id)?.colaborador_id ?? null,
      deve_trocar_senha: u.app_metadata?.must_change_password === true,
    }))
    return NextResponse.json({ usuarios })
  } catch (e) {
    return tratarErroServico(e)
  }
}

export async function PATCH(request: Request) {
  const { ok } = await exigirGestorAcesso()
  if (!ok) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })

  try {
    const body = await request.json()
    const usuarioId = String(body?.usuario_id ?? "")
    const nome = String(body?.nome ?? "").trim()
    if (!/^[0-9a-f-]{36}$/i.test(usuarioId) || nome.length < 2 || nome.length > 100) {
      return NextResponse.json({ error: "Informe um nome válido." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: pessoas, error: pessoaError } = await admin
      .from("colaboradores")
      .select("id, nome")
      .eq("ativo", true)
      .ilike("nome", nome)
      .limit(2)
    if (pessoaError) throw pessoaError

    const pessoa = pessoas?.length === 1 ? pessoas[0] : null
    if (pessoa) {
      const { data: existente } = await admin
        .from("usuarios_vinculos")
        .select("usuario_id")
        .eq("colaborador_id", pessoa.id)
        .maybeSingle()
      if (existente && existente.usuario_id !== usuarioId) {
        return NextResponse.json({ error: "Este cadastro já pertence a outro usuário." }, { status: 409 })
      }
    }

    const { data: usuarioAtual, error: usuarioError } = await admin.auth.admin.getUserById(usuarioId)
    if (usuarioError) throw usuarioError

    const { error: nomeError } = await admin.auth.admin.updateUserById(usuarioId, {
      user_metadata: { ...usuarioAtual.user.user_metadata, nome },
    })
    if (nomeError) throw nomeError

    const { error: clearError } = await admin.from("usuarios_vinculos").delete().eq("usuario_id", usuarioId)
    if (clearError) throw clearError

    if (pessoa) {
      const { error: linkError } = await admin
        .from("usuarios_vinculos")
        .insert({ usuario_id: usuarioId, colaborador_id: pessoa.id })
      if (linkError) throw linkError
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return tratarErroServico(e)
  }
}

export async function POST(request: Request) {
  const { ok } = await exigirGestorAcesso()
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
    if (!["financeiro", "socio", "colaborador", "juridico"].includes(papel)) {
      return NextResponse.json({ error: "Papel de usuário inválido." }, { status: 400 })
    }
    if (senha.length < 8) {
      return NextResponse.json({ error: "A senha temporária deve ter ao menos 8 caracteres." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: criado, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
      app_metadata: {
        role: papel,
        must_change_password: true,
      },
    })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes("already") || msg.includes("registered")) {
        return NextResponse.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 })
      }
      throw error
    }

    const { data: pessoas } = await admin
      .from("colaboradores")
      .select("id")
      .eq("ativo", true)
      .ilike("nome", nome)
      .limit(2)

    if (criado.user && pessoas?.length === 1) {
      await admin.from("usuarios_vinculos").insert({
        usuario_id: criado.user.id,
        colaborador_id: pessoas[0].id,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return tratarErroServico(e)
  }
}

export async function DELETE(request: Request) {
  const { ok, user } = await exigirGestorAcesso()
  if (!ok) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID não informado." }, { status: 400 })
    if (id === user?.id) {
      return NextResponse.json({ error: "Você não pode excluir a própria conta." }, { status: 400 })
    }

    const admin = createAdminClient()
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
