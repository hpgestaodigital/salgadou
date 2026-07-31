import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { notificarRegistro } from "@/lib/notifications"

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  const body = await request.json()
  if (!["fornecedor", "motoboy", "tarefa"].includes(body.tipo) || !body.id) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  return NextResponse.json(await notificarRegistro(body.tipo, body.id, "novo", "insert"))
}
