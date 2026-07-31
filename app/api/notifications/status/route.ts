import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { evolutionConfigurada } from "@/lib/evolution/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  const { data } = await supabase.from("configuracoes").select("chave,valor").in("chave", ["evolution_url", "evolution_instance"])
  const cfg = Object.fromEntries((data ?? []).map((item) => [item.chave, item.valor]))
  return NextResponse.json({ configured: evolutionConfigurada(cfg.evolution_url, cfg.evolution_instance) })
}
