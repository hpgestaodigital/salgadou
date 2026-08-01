import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ADMIN_EMAIL, getPapel, type Papel } from "@/lib/auth-roles"

const MODULOS = [
  "dashboard", "escala", "kanban", "reunioes", "juridico", "historico",
  "pagamentos_fornecedores", "pagamentos_motoboys", "cadastros", "usuarios",
  "configuracoes", "producao_compras", "producao_estoque", "producao_planejamento",
] as const

async function exigirGestor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const papel = getPapel(user)
  return { ok: Boolean(user && (papel === "admin" || papel === "socio")), user, papel }
}

export async function GET(request: Request) {
  const { ok } = await exigirGestor()
  if (!ok) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })

  const usuarioId = new URL(request.url).searchParams.get("usuario_id")
  if (!usuarioId) return NextResponse.json({ error: "Usuário não informado." }, { status: 400 })

  try {
    const admin = createAdminClient()
    const [{ data: usuario, error: usuarioError }, { data: padrao, error: padraoError }, { data: individuais, error: individuaisError }] =
      await Promise.all([
        admin.auth.admin.getUserById(usuarioId),
        admin.from("perfis_permissoes").select("modulo, pode_visualizar"),
        admin.from("usuarios_permissoes").select("modulo, pode_visualizar").eq("usuario_id", usuarioId),
      ])

    if (usuarioError || padraoError || individuaisError) throw usuarioError || padraoError || individuaisError
    const papel = (usuario.user.app_metadata?.role as Papel) || "colaborador"
    const base = Object.fromEntries(
      (padrao ?? []).filter((item) => item.modulo && item.pode_visualizar !== null)
        .map((item) => [item.modulo, item]),
    )
    const permissoes = Object.fromEntries(
      MODULOS.map((modulo) => {
        const individual = (individuais ?? []).find((item) => item.modulo === modulo)
        const perfil = (padrao ?? []).find((item) => item.modulo === modulo && item.papel === papel)
        return [modulo, individual?.pode_visualizar ?? perfil?.pode_visualizar ?? false]
      }),
    )

    return NextResponse.json({ papel, permissoes, base })
  } catch (error) {
    console.error("Erro ao carregar permissões:", error)
    return NextResponse.json({ error: "Não foi possível carregar as permissões." }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const { ok } = await exigirGestor()
  if (!ok) return NextResponse.json({ error: "Acesso negado." }, { status: 403 })

  try {
    const body = await request.json()
    const usuarioId = String(body?.usuario_id ?? "")
    const papel = String(body?.papel ?? "") as Papel
    const permissoes = body?.permissoes as Record<string, boolean>

    if (!/^[0-9a-f-]{36}$/i.test(usuarioId) || !["socio", "juridico", "colaborador"].includes(papel)) {
      return NextResponse.json({ error: "Dados de acesso inválidos." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: alvo, error: alvoError } = await admin.auth.admin.getUserById(usuarioId)
    if (alvoError) throw alvoError
    if (alvo.user.email === ADMIN_EMAIL) {
      return NextResponse.json({ error: "O administrador padrão é protegido." }, { status: 400 })
    }

    const entradas = MODULOS.map((modulo) => ({
      usuario_id: usuarioId,
      modulo,
      pode_visualizar: Boolean(permissoes?.[modulo]),
      updated_at: new Date().toISOString(),
    }))

    const { error: roleError } = await admin.auth.admin.updateUserById(usuarioId, {
      app_metadata: { ...alvo.user.app_metadata, role: papel },
    })
    if (roleError) throw roleError

    const { error: permissoesError } = await admin
      .from("usuarios_permissoes")
      .upsert(entradas, { onConflict: "usuario_id,modulo" })
    if (permissoesError) throw permissoesError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Erro ao salvar permissões:", error)
    return NextResponse.json({ error: "Não foi possível salvar as permissões." }, { status: 500 })
  }
}
