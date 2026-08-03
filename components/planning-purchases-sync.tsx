"use client"

import { RefreshCw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function PlanningPurchasesSync() {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  async function sincronizar() {
    setSaving(true)
    const { data, error } = await supabase.rpc("sincronizar_compras_planejamento")
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(`Lista de compras atualizada. ${Number(data ?? 0)} item(ns) inserido(s) ou revisado(s).`)
    window.dispatchEvent(new Event("salgadou:compras-atualizadas"))
  }
  return <Card className="mb-6 border-primary/25"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong>Compras ligadas ao planejamento</strong><p className="text-sm text-muted-foreground">Consolida apenas as faltas reais da cadeia, descontando insumos e preparos disponíveis.</p></div><Button disabled={saving} onClick={sincronizar}><RefreshCw className={saving ? "size-4 animate-spin" : "size-4"} />Atualizar lista de compras</Button></CardContent></Card>
}
