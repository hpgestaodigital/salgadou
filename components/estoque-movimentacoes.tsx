"use client"

import { useEffect, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type InsumoResumo = { id: string; nome: string; unidade: string }
type Movimentacao = {
  id: string
  insumo_id: string
  tipo: string
  quantidade: number
  saldo_anterior: number
  saldo_posterior: number
  origem_tipo: string | null
  motivo: string | null
  observacoes: string | null
  movimento_estornado_id: string | null
  created_at: string
}

const TIPOS: Record<string, string> = {
  saldo_inicial: "Saldo inicial",
  entrada_compra: "Entrada por compra",
  entrada_manual: "Entrada manual",
  saida_producao: "Consumo da produção",
  saida_manual: "Saída manual",
  ajuste_positivo: "Ajuste positivo",
  ajuste_negativo: "Ajuste negativo",
  ajuste_direto: "Ajuste direto legado",
  estorno_consumo: "Correção de consumo",
  estorno: "Estorno",
  perda: "Perda",
}

export function EstoqueMovimentacoes({ insumos, refreshKey, onUpdated }: {
  insumos: InsumoResumo[]
  refreshKey: string
  onUpdated: () => Promise<void>
}) {
  const supabase = createClient()
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState("")

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from("producao_estoque_movimentacoes")
      .select("id, insumo_id, tipo, quantidade, saldo_anterior, saldo_posterior, origem_tipo, motivo, observacoes, movimento_estornado_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) toast.error("Não foi possível carregar o extrato do estoque.")
    setMovimentacoes((data ?? []) as Movimentacao[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [refreshKey])

  async function estornar(movimentacao: Movimentacao) {
    const motivo = window.prompt("Informe o motivo do estorno:")
    if (!motivo?.trim()) return
    if (!window.confirm("Confirmar o estorno desta movimentação? O saldo será alterado pela quantidade inversa.")) return

    setSavingId(movimentacao.id)
    try {
      const { error } = await supabase.rpc("estornar_movimentacao_estoque", {
        movimentacao_id_param: movimentacao.id,
        motivo_param: motivo.trim(),
      })
      if (error) throw error
      toast.success("Movimentação estornada e saldo atualizado.")
      await onUpdated()
      await carregar()
    } catch (error) {
      const mensagem = error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Não foi possível estornar a movimentação."
      toast.error(mensagem)
    } finally {
      setSavingId("")
    }
  }

  const idsEstornados = new Set(movimentacoes.map((item) => item.movimento_estornado_id).filter(Boolean))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extrato de movimentações</CardTitle>
        <p className="text-sm text-muted-foreground">Entradas, consumos, ajustes e estornos com o saldo antes e depois de cada operação.</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Carregando extrato...</div>
        ) : movimentacoes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
        ) : (
          <div className="grid gap-2">
            {movimentacoes.map((movimentacao) => {
              const insumo = insumos.find((item) => item.id === movimentacao.insumo_id)
              const positiva = Number(movimentacao.quantidade) > 0
              const foiEstornada = idsEstornados.has(movimentacao.id)
              const podeEstornar = movimentacao.tipo !== "estorno" && !foiEstornada
              return (
                <div key={movimentacao.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{insumo?.nome || "Insumo"}</p>
                        <Badge variant={positiva ? "secondary" : "outline"}>{TIPOS[movimentacao.tipo] || movimentacao.tipo}</Badge>
                        {foiEstornada && <Badge variant="outline">Estornada</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(movimentacao.created_at))}
                        {movimentacao.origem_tipo ? ` · ${movimentacao.origem_tipo.replaceAll("_", " ")}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold tabular-nums ${positiva ? "text-emerald-500" : "text-amber-500"}`}>
                        {positiva ? "+" : ""}{movimentacao.quantidade} {insumo?.unidade || ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{movimentacao.saldo_anterior} → {movimentacao.saldo_posterior}</p>
                    </div>
                  </div>
                  {(movimentacao.motivo || movimentacao.observacoes) && <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                    {movimentacao.motivo && <p><strong className="text-foreground">Motivo:</strong> {movimentacao.motivo}</p>}
                    {movimentacao.observacoes && <p><strong className="text-foreground">Observações:</strong> {movimentacao.observacoes}</p>}
                  </div>}
                  {podeEstornar && <div className="mt-2 flex justify-end">
                    <Button type="button" size="sm" variant="ghost" disabled={savingId === movimentacao.id} onClick={() => estornar(movimentacao)}>
                      {savingId === movimentacao.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                      Estornar
                    </Button>
                  </div>}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
