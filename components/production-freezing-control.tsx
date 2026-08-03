"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Clock3, Loader2, Snowflake } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Produto = { id: string; nome: string }
type Lote = {
  id: string
  codigo: string
  produto_id: string
  data_producao: string
  status: "em_congelamento" | "aguardando_empacotamento" | "empacotado" | "encerrado"
  quantidade_saida_maquina: number
  caixas_produzidas: number
  estimativa_porcoes: number | null
  congelamento_iniciado_em: string | null
  congelado_em: string | null
}

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })

export function ProductionFreezingControl() {
  const supabase = createClient()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [estimativas, setEstimativas] = useState<Record<string, string>>({})

  async function carregar() {
    setLoading(true)
    const [produtosResult, lotesResult] = await Promise.all([
      supabase.from("producao_produtos").select("id,nome").order("nome"),
      supabase.from("producao_lotes").select("id,codigo,produto_id,data_producao,status,quantidade_saida_maquina,caixas_produzidas,estimativa_porcoes,congelamento_iniciado_em,congelado_em")
        .in("status", ["em_congelamento", "aguardando_empacotamento"]).order("created_at"),
    ])
    if (produtosResult.error || lotesResult.error) toast.error("Não foi possível carregar as etapas de congelamento.")
    setProdutos((produtosResult.data ?? []) as Produto[])
    setLotes((lotesResult.data ?? []) as Lote[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [])

  async function marcarCongelado(lote: Lote) {
    const valor = estimativas[lote.id]?.trim()
    const estimativa = valor ? Number(valor) : null
    if (estimativa !== null && (!Number.isFinite(estimativa) || estimativa <= 0)) {
      return toast.error("Informe uma estimativa de porções válida ou deixe o campo vazio.")
    }
    setSavingId(lote.id)
    const { error } = await supabase.rpc("marcar_lote_como_congelado", {
      lote_id_param: lote.id,
      estimativa_porcoes_param: estimativa,
      observacoes_param: null,
    })
    setSavingId(null)
    if (error) return toast.error(error.message)
    toast.success("Lote marcado como congelado e liberado para empacotamento.")
    await carregar()
  }

  if (loading) return null
  if (lotes.length === 0) return null

  const emCongelamento = lotes.filter((lote) => lote.status === "em_congelamento")
  const aguardando = lotes.filter((lote) => lote.status === "aguardando_empacotamento")

  return (
    <Card className="mb-5 border-sky-500/25 bg-sky-500/[0.035]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Snowflake className="size-5 text-sky-400" />Controle de congelamento</CardTitle>
        <p className="text-sm text-muted-foreground">A estimativa ajuda o planejamento, mas só as porções realmente empacotadas entram no estoque disponível.</p>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Em congelamento</h3><Badge variant="secondary">{emCongelamento.length}</Badge></div>
          {emCongelamento.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum lote congelando agora.</p>}
          {emCongelamento.map((lote) => {
            const produto = produtos.find((item) => item.id === lote.produto_id)
            return <div key={lote.id} className="rounded-xl border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{produto?.nome || "Produto"}</p><p className="font-mono text-xs text-primary">{lote.codigo}</p></div><Badge className="bg-sky-500/15 text-sky-300">Em congelamento</Badge></div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Resumo label="Estimativa da máquina" valor={`${lote.quantidade_saida_maquina} un`} /><Resumo label="Caixas" valor={String(lote.caixas_produzidas)} /></div>
              {lote.congelamento_iniciado_em && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" />Entrada: {dataHora.format(new Date(lote.congelamento_iniciado_em))}</p>}
              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><div><Label className="text-xs">Estimativa de porções após congelar</Label><Input type="number" min="1" step="1" placeholder="Opcional" value={estimativas[lote.id] ?? ""} onChange={(event) => setEstimativas((atual) => ({ ...atual, [lote.id]: event.target.value }))} /></div><Button disabled={savingId === lote.id} onClick={() => marcarCongelado(lote)}>{savingId === lote.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Marcar como congelado</Button></div>
            </div>
          })}
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Congelados aguardando empacotamento</h3><Badge variant="outline">{aguardando.length}</Badge></div>
          {aguardando.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum lote aguardando empacotamento.</p>}
          {aguardando.map((lote) => {
            const produto = produtos.find((item) => item.id === lote.produto_id)
            return <div key={lote.id} className="rounded-xl border bg-background p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{produto?.nome || "Produto"}</p><p className="font-mono text-xs text-primary">{lote.codigo}</p></div><Badge variant="secondary">Pronto para empacotar</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Resumo label="Estimativa da máquina" valor={`${lote.quantidade_saida_maquina} un`} /><Resumo label="Estimativa de porções" valor={lote.estimativa_porcoes ? `≈ ${lote.estimativa_porcoes}` : "Não informada"} /></div>{lote.congelado_em && <p className="mt-2 text-xs text-muted-foreground">Congelado em {dataHora.format(new Date(lote.congelado_em))}</p>}</div>
          })}
        </section>
      </CardContent>
    </Card>
  )
}

function Resumo({ label, valor }: { label: string; valor: string }) {
  return <div className="rounded-lg bg-muted/30 p-2.5"><p className="text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{valor}</p></div>
}
