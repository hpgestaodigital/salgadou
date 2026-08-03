"use client"

import { useEffect, useState } from "react"
import { Loader2, PlugZap } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Integracao = { id: string; nome: string; status: string; objetivo: string; observacoes: string | null }

export function ProductionIntegrationsRoadmap() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [integracoes, setIntegracoes] = useState<Integracao[]>([])
  useEffect(() => { supabase.from("producao_integracoes").select("*").order("nome").then(({ data, error }) => { if (error) toast.error("Não foi possível carregar as integrações."); setIntegracoes((data ?? []) as Integracao[]); setLoading(false) }) }, [supabase])
  if (loading) return <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando integrações...</div>
  return <div className="space-y-6">
    <PageHeader title="Integrações da Produção" description="Etapa deliberadamente pendente até a operação interna e os códigos comerciais estarem homologados." />
    <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="p-5 text-sm"><strong>Nenhuma integração movimenta estoque neste momento.</strong><p className="mt-1 text-muted-foreground">A ativação só deve ocorrer após testes de venda simples, promoções, sabores, bônus, alterações, cancelamentos e prevenção de processamento duplicado.</p></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-2">{integracoes.map((item) => <Card key={item.id}><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><PlugZap className="size-5 text-primary" /><CardTitle>{item.nome}</CardTitle></div><Badge variant="outline">{item.status}</Badge></div></CardHeader><CardContent className="space-y-3 text-sm"><p>{item.objetivo}</p>{item.observacoes && <p className="rounded-lg bg-muted/30 p-3 text-muted-foreground">{item.observacoes}</p>}</CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Critérios para ativar a Saipos</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm md:grid-cols-2"><p>✓ Venda simples com código estável</p><p>✓ Promoção com escolha de sabores</p><p>✓ Bônus fixo sem dupla contagem</p><p>✓ Pedido do iFood preservando itens</p><p>✓ Alteração e cancelamento reversíveis</p><p>✓ Idempotência pelo identificador da venda</p></CardContent></Card>
  </div>
}
