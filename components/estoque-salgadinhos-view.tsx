"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Boxes, CalendarDays, Loader2, PackageCheck, Snowflake } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Produto = { id: string; nome: string; unidade: string }
type Lote = {
  id: string
  codigo: string
  planejamento_id: string
  produto_id: string
  data_producao: string
  status: "congelado" | "empacotado" | "encerrado"
  quantidade_planejada: number
  quantidade_saida_maquina: number
  caixas_produzidas: number
  caixas_empacotadas: number
  porcoes_produzidas: number
  porcoes_disponiveis: number
  observacoes: string | null
  created_at: string
}

const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })

export function EstoqueSalgadinhosView() {
  const supabase = createClient()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    const [produtosResult, lotesResult] = await Promise.all([
      supabase.from("producao_produtos").select("id, nome, unidade").eq("ativo", true).order("nome"),
      supabase.from("producao_lotes").select("*").order("data_producao", { ascending: false }).order("created_at", { ascending: false }),
    ])
    if (produtosResult.error || lotesResult.error) {
      toast.error("Não foi possível carregar o estoque de salgadinhos.")
    }
    setProdutos((produtosResult.data ?? []) as Produto[])
    setLotes((lotesResult.data ?? []) as Lote[])
    setLoading(false)
  }

  useEffect(() => { void carregar() }, [])

  const congelados = lotes.filter((lote) => lote.status === "congelado")
  const empacotados = lotes.filter((lote) => lote.status === "empacotado" && Number(lote.porcoes_disponiveis) > 0)
  const resumo = useMemo(() => produtos.map((produto) => {
    const lotesProduto = lotes.filter((lote) => lote.produto_id === produto.id)
    return {
      produto,
      caixasCongeladas: lotesProduto.reduce((total, lote) => total + Math.max(0, Number(lote.caixas_produzidas) - Number(lote.caixas_empacotadas)), 0),
      porcoesDisponiveis: lotesProduto.reduce((total, lote) => total + Number(lote.porcoes_disponiveis), 0),
      lotesAtivos: lotesProduto.filter((lote) => lote.status !== "encerrado").length,
    }
  }).filter((item) => item.caixasCongeladas > 0 || item.porcoesDisponiveis > 0), [lotes, produtos])

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" />Carregando estoque de salgadinhos...</div>

  return (
    <div className="space-y-6">
      <PageHeader title="Estoque de salgadinhos" description="Acompanhe separadamente os lotes congelados e as porções realmente empacotadas." />

      <Card className="border-primary/25 bg-primary/[0.035]">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Este estoque não inclui farinha, recheios ou outros insumos.</p>
            <p className="text-sm text-muted-foreground">Cada produção gera um lote. O saldo final só passa a contar como porções disponíveis depois do empacotamento.</p>
          </div>
          <Button asChild variant="outline"><Link href="/producao?tab=planejamento"><CalendarDays className="size-4" />Abrir planejamento</Link></Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {resumo.length === 0 && <Card className="sm:col-span-2 xl:col-span-3"><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum lote com saldo disponível.</CardContent></Card>}
        {resumo.map(({ produto, caixasCongeladas, porcoesDisponiveis, lotesAtivos }) => (
          <Card key={produto.id}>
            <CardHeader className="pb-3"><CardTitle className="text-base">{produto.nome}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-sky-500/10 p-3"><Snowflake className="mx-auto mb-1 size-4 text-sky-400" /><p className="text-muted-foreground">Congeladas</p><p className="mt-1 font-bold">{caixasCongeladas} cx</p></div>
              <div className="rounded-lg bg-emerald-500/10 p-3"><PackageCheck className="mx-auto mb-1 size-4 text-emerald-400" /><p className="text-muted-foreground">Porções</p><p className="mt-1 font-bold">{porcoesDisponiveis}</p></div>
              <div className="rounded-lg bg-muted/40 p-3"><Boxes className="mx-auto mb-1 size-4" /><p className="text-muted-foreground">Lotes</p><p className="mt-1 font-bold">{lotesAtivos}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Snowflake className="size-5 text-sky-400" />Congelados aguardando empacotamento</CardTitle><p className="text-sm text-muted-foreground">Caixas que já saíram da máquina, mas ainda não possuem rendimento final em porções.</p></CardHeader>
          <CardContent className="grid gap-3">
            {congelados.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum lote aguardando empacotamento.</p>}
            {congelados.map((lote) => <LoteCard key={lote.id} lote={lote} produto={produtos.find((p) => p.id === lote.produto_id)} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><PackageCheck className="size-5 text-emerald-400" />Porções empacotadas por lote</CardTitle><p className="text-sm text-muted-foreground">Quantidade real que cada lote rendeu e que está disponível no estoque final.</p></CardHeader>
          <CardContent className="grid gap-3">
            {empacotados.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhum lote empacotado com saldo disponível.</p>}
            {empacotados.map((lote) => <LoteCard key={lote.id} lote={lote} produto={produtos.find((p) => p.id === lote.produto_id)} />)}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function LoteCard({ lote, produto }: { lote: Lote; produto?: Produto }) {
  const caixasRestantes = Math.max(0, Number(lote.caixas_produzidas) - Number(lote.caixas_empacotadas))
  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{produto?.nome || "Produto"}</p>
          <p className="mt-1 font-mono text-xs text-primary">{lote.codigo}</p>
        </div>
        <Badge variant={lote.status === "congelado" ? "secondary" : "outline"}>{lote.status === "congelado" ? "Congelado" : "Empacotado"}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Resumo label="Produção" valor={dataCurta.format(new Date(`${lote.data_producao}T12:00:00Z`))} />
        <Resumo label="Saída máquina" valor={`${lote.quantidade_saida_maquina} ${produto?.unidade || "un"}`} />
        <Resumo label="Caixas restantes" valor={String(caixasRestantes)} />
        <Resumo label="Porções disponíveis" valor={String(lote.porcoes_disponiveis)} />
      </div>
      {lote.observacoes && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{lote.observacoes}</p>}
    </div>
  )
}

function Resumo({ label, valor }: { label: string; valor: string }) {
  return <div className="rounded-lg bg-muted/30 p-2.5"><p className="text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{valor}</p></div>
}
