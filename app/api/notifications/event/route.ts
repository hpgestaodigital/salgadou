import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { notificarRegistro } from "@/lib/notifications"

const MODULO_POR_TIPO = {
  fornecedor: "pagamentos_fornecedores",
  motoboy: "pagamentos_motoboys",
  tarefa: "kanban",
} as const

type TipoNotificacao = keyof typeof MODULO_POR_TIPO

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 })

  const body = await request.json().catch(() => null)
  const tipo = String(body?.tipo ?? "") as TipoNotificacao
  const id = String(body?.id ?? "")
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!(tipo in MODULO_POR_TIPO) || !uuid.test(id)) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }

  const modulo = MODULO_POR_TIPO[tipo]
  const papel = String(user.app_metadata?.role || "colaborador")
  const [{ data: individual, error: individualError }, { data: padrao, error: padraoError }] = await Promise.all([
    supabase
      .from("usuarios_permissoes")
      .select("pode_visualizar")
      .eq("usuario_id", user.id)
      .eq("modulo", modulo)
      .maybeSingle(),
    supabase
      .from("perfis_permissoes")
      .select("pode_visualizar")
      .eq("papel", papel)
      .eq("modulo", modulo)
      .maybeSingle(),
  ])

  if (individualError || padraoError) {
    return NextResponse.json({ error: "Não foi possível validar a permissão." }, { status: 503 })
  }
  const permitido = individual?.pode_visualizar ?? padrao?.pode_visualizar ?? false
  if (!permitido) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
  }

  return NextResponse.json(await notificarRegistro(tipo, id, "novo", "insert"))
}
