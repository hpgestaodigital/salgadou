import { NextResponse } from "next/server"
import { processarNotificacoesAgendadas } from "@/lib/notifications"

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await processarNotificacoesAgendadas()) })
  } catch (error) {
    console.error("[notifications]", error)
    return NextResponse.json({ error: "Falha ao processar notificações." }, { status: 500 })
  }
}
