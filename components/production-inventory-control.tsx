"use client"

import { useEffect, useMemo, useState } from "react"
import { ClipboardCheck, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Tipo = "insumo" | "preparo" | "molho_grande" | "molho_pequena" | "salgadinho"
type Referencia = { id: string; nome: string; saldo: number; unidade: string }
type Rastro = { id: string; fonte: string; referencia_id: string; item: string; tipo: string; quantidade: number; unidade: string; saldo_anterior: number; saldo_posterior: number; origem_tipo: string | null; motivo: string | null; lote: string | null; criado_por: string | null; created_at: string }
type Contagem = { id: string; tipo_estoque: string; referencia_id: string; saldo_sistema: number; saldo_contado: number; unidade: string; motivo: string; created_at: string }
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
const tipos: { id: Tipo; label: string }[] = [
  { id: "insumo", label: "Insumos" }, { id: "preparo", label: "Massas e recheios" },
  { id: "molho_grande", label: "Molhos grandes" }, { id: "molho_pequena", label: "Molhos pequenos" },
  { id: "salgadinho", label: "Salgadinhos empacotados" },
]

export function ProductionInventoryControl() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [referencias, setReferencias] = useState<Record<Tipo, Referencia[]>>({ insumo: [], preparo: [], molho_grande: [], molho_pequena: [], salgadinho: [] })
  const [rastros, setRastros] = useState<Rastro[]>([])
  const [contagens, setContagens] = useState<Contagem[]>([])
  const [tipo, setTipo] = useState<Tipo>("insumo")
  const [referenciaId, setReferenciaId] = useState("")
  const [saldoContado, setSaldoContado] = useState("")
  const [motivo, setMotivo] = useState("Contagem física periódica")
  const [observacoes, setObservacoes] = useState("")
  const [busca, setBusca] = useState("")
  const [fonte, setFonte] = useState("todas")

  async function carregar() {
    setLoading(true)
    const [insumos, preparos, molhos, produtos, lotes, rastreabilidade, historico] = await Promise.all([
      supabase.from("producao_insumos").select("id,nome,estoque_atual,unidade").eq("ativo", true).eq("controla_estoque", true).order("nome"),
      supabase.from("producao_estoque_preparos").select("ficha_id,nome,quantidade_disponivel,unidade").order("nome"),
      supabase.from("producao_estoque_molhos").select("ficha_id,nome,grandes_disponiveis,pequenas_disponiveis").order("nome"),
      supabase.from("producao_produtos").select("id,nome").eq("ativo", true).order("nome"),
      supabase.from("producao_lotes").select("produto_id,porcoes_disponiveis"),
      supabase.from("producao_rastreabilidade").select("*").order("created_at", { ascending: false }).limit(250),
      supabase.from("producao_contagens_fisicas").select("*").order("created_at", { ascending: false }).limit(50),
    ])
    const erro = [insumos, preparos, molhos, produtos, lotes, rastreabilidade, historico].find((r) => r.error)?.error
    if (erro) toast.error("Não foi possível carregar a gestão de estoque.")
    const saldosProduto = new Map<string, number>()
    for (const lote of (lotes.data ?? []) as { produto_id: string; porcoes_disponiveis: number }[]) saldosProduto.set(lote.produto_id, (saldosProduto.get(lote.produto_id) ?? 0) + Number(lote.porcoes_disponiveis))
    const molhosData = (molhos.data ?? []) as { ficha_id: string; nome: string; grandes_disponiveis: number; pequenas_disponiveis: number }[]
    setReferencias({
      insumo: ((insumos.data ?? []) as { id: string; nome: string; estoque_atual: number; unidade: string }[]).map((i) => ({ id: i.id, nome: i.nome, saldo: Number(i.estoque_atual), unidade: i.unidade })),
      preparo: ((preparos.data ?? []) as { ficha_id: string; nome: string; quantidade_disponivel: number; unidade: string }[]).map((i) => ({ id: i.ficha_id, nome: i.nome, saldo: Number(i.quantidade_disponivel), unidade: i.unidade })),
      molho_grande: molhosData.map((i) => ({ id: i.ficha_id, nome: i.nome, saldo: Number(i.grandes_disponiveis), unidade: "un" })),
      molho_pequena: molhosData.map((i) => ({ id: i.ficha_id, nome: i.nome, saldo: Number(i.pequenas_disponiveis), unidade: "un" })),
      salgadinho: ((produtos.data ?? []) as { id: string; nome: string }[]).map((i) => ({ id: i.id, nome: i.nome, saldo: saldosProduto.get(i.id) ?? 0, unidade: "porção" })),
    })
    setRastros((rastreabilidade.data ?? []) as Rastro[])
    setContagens((historico.data ?? []) as Contagem[])
    setLoading(false)
  }
  useEffect(() => { void carregar() }, [])

  const selecionado = referencias[tipo].find((r) => r.id === referenciaId)
  const filtrados = useMemo(() => rastros.filter((r) => (fonte === "todas" || r.fonte === fonte) && (!busca.trim() || `${r.item} ${r.motivo ?? ""} ${r.lote ?? ""}`.toLowerCase().includes(busca.toLowerCase()))), [rastros, fonte, busca])

  function trocarTipo(novo: Tipo) { setTipo(novo); setReferenciaId(""); setSaldoContado("") }

  async function registrarContagem() {
    if (!referenciaId || Number(saldoContado) < 0 || saldoContado === "") return toast.error("Selecione o item e informe o saldo contado.")
    setSaving(true)
    const { error } = await supabase.rpc("registrar_contagem_fisica", { tipo_param: tipo, referencia_id_param: referenciaId, saldo_contado_param: Number(saldoContado), motivo_param: motivo, observacoes_param: observacoes || null })
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("Contagem registrada, diferença ajustada e histórico preservado.")
    setReferenciaId(""); setSaldoContado(""); setObservacoes(""); await carregar()
  }

  if (loading) return <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando inventário...</div>
  return <div className="space-y-6">
    <PageHeader title="Inventário e Rastreabilidade" description="Contagem física, ajustes auditáveis e extrato unificado de toda a cadeia produtiva." />

    <Card className="border-primary/25"><CardHeader><CardTitle>Nova contagem física</CardTitle><p className="text-sm text-muted-foreground">A diferença entre o sistema e a contagem real gera uma movimentação identificada. Nenhum saldo é sobrescrito silenciosamente.</p></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2">{tipos.map((t) => <Button key={t.id} variant={tipo === t.id ? "default" : "outline"} onClick={() => trocarTipo(t.id)}>{t.label}</Button>)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><div className="xl:col-span-2"><Label>Item</Label><select className={selectClass} value={referenciaId} onChange={(e) => { setReferenciaId(e.target.value); const ref = referencias[tipo].find((r) => r.id === e.target.value); setSaldoContado(ref ? String(ref.saldo) : "") }}><option value="">Selecione</option>{referencias[tipo].map((r) => <option key={r.id} value={r.id}>{r.nome} · sistema {r.saldo} {r.unidade}</option>)}</select></div><div><Label>Saldo contado</Label><Input type="number" step="0.001" value={saldoContado} onChange={(e) => setSaldoContado(e.target.value)} /></div><div><Label>Motivo</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div><div className="flex items-end"><Button className="w-full" disabled={saving} onClick={registrarContagem}><ClipboardCheck className="size-4" />Registrar</Button></div><div className="md:col-span-2 xl:col-span-5"><Label>Observações</Label><Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ocorrência, perda, responsável pela conferência..." /></div></div>
      {selecionado && <div className="rounded-xl bg-muted/30 p-3 text-sm">Saldo do sistema: <strong>{selecionado.saldo} {selecionado.unidade}</strong>{saldoContado !== "" && <> · diferença prevista: <strong>{Number(saldoContado) - selecionado.saldo} {selecionado.unidade}</strong></>}</div>}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Últimas contagens</CardTitle></CardHeader><CardContent className="space-y-2">{contagens.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma contagem registrada.</p> : contagens.map((c) => <div key={c.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"><div><strong>{tipos.find((t) => t.id === c.tipo_estoque)?.label ?? c.tipo_estoque}</strong><p className="text-muted-foreground">{c.motivo}</p></div><div className="text-right"><strong>{c.saldo_sistema} → {c.saldo_contado} {c.unidade}</strong><p className="text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</p></div></div>)}</CardContent></Card>

    <Card><CardHeader><CardTitle>Extrato unificado</CardTitle><p className="text-sm text-muted-foreground">Insumos, massas, recheios, molhos e salgadinhos em uma única linha do tempo.</p></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[180px_1fr]"><select className={selectClass} value={fonte} onChange={(e) => setFonte(e.target.value)}><option value="todas">Todas as origens</option><option value="insumo">Insumos</option><option value="preparo">Massas e recheios</option><option value="molho">Molhos</option><option value="salgadinho">Salgadinhos</option></select><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar item, motivo ou lote" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></div>
      <div className="space-y-2">{filtrados.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma movimentação encontrada.</p> : filtrados.map((r) => <div key={`${r.fonte}-${r.id}`} className="grid gap-2 rounded-xl border p-3 text-sm md:grid-cols-[1fr_auto_auto]"><div><div className="flex flex-wrap items-center gap-2"><strong>{r.item}</strong><Badge variant="outline">{r.fonte}</Badge>{r.lote && <Badge variant="secondary">{r.lote}</Badge>}</div><p className="text-muted-foreground">{r.motivo || r.origem_tipo || "Movimentação"}</p></div><div><strong>{r.tipo === "saida" || r.tipo === "saida_manual" ? "-" : "+"}{r.quantidade} {r.unidade}</strong><p className="text-muted-foreground">{r.saldo_anterior} → {r.saldo_posterior}</p></div><div className="text-right text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</div></div>)}</div>
    </CardContent></Card>
  </div>
}
