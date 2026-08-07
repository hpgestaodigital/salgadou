"use client"

import { useEffect, useMemo, useState } from "react"
import { Building2, CreditCard, Loader2, Plus, Save, Trash2, WalletCards } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { getPapel } from "@/lib/auth-roles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Conta = { id: string; nome: string; pix_habilitado: boolean; ativo: boolean }
type Cartao = { id: string; conta_id: string; nome: string; modalidade: "debito" | "credito"; bandeira: string | null; final_4: string | null; ativo: boolean }

export function PaymentMethodSettings() {
  const supabase = createClient()
  const [admin, setAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [novoBanco, setNovoBanco] = useState("")
  const [novoPix, setNovoPix] = useState(true)
  const [cartaoContaId, setCartaoContaId] = useState("")
  const [cartaoNome, setCartaoNome] = useState("")
  const [cartaoModalidade, setCartaoModalidade] = useState<"debito" | "credito">("credito")
  const [cartaoBandeira, setCartaoBandeira] = useState("")
  const [cartaoFinal, setCartaoFinal] = useState("")

  async function carregar() {
    const [{ data: contasData, error: contasError }, { data: cartoesData, error: cartoesError }] = await Promise.all([
      supabase.from("financeiro_contas_pagamento").select("id,nome,pix_habilitado,ativo").order("nome"),
      supabase.from("financeiro_cartoes").select("id,conta_id,nome,modalidade,bandeira,final_4,ativo").order("nome"),
    ])
    if (contasError) throw contasError
    if (cartoesError) throw cartoesError
    setContas((contasData ?? []) as Conta[])
    setCartoes((cartoesData ?? []) as Cartao[])
  }

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!ativo) return
      const isAdmin = getPapel(data.user) === "admin"
      setAdmin(isAdmin)
      if (isAdmin) {
        try { await carregar() } catch (e) { console.error(e) }
      }
      if (ativo) setLoading(false)
    })()
    return () => { ativo = false }
  }, [])

  const contasAtivas = useMemo(() => contas.filter((c) => c.ativo), [contas])

  async function adicionarBanco() {
    if (!novoBanco.trim()) { toast.error("Informe o nome da conta ou banco."); return }
    setSaving(true)
    try {
      const { error } = await supabase.from("financeiro_contas_pagamento").insert({ nome: novoBanco.trim(), pix_habilitado: novoPix })
      if (error) throw error
      setNovoBanco("")
      setNovoPix(true)
      await carregar()
      toast.success("Conta cadastrada.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar a conta.")
    } finally { setSaving(false) }
  }

  async function adicionarCartao() {
    if (!cartaoContaId || !cartaoNome.trim()) { toast.error("Selecione a conta e informe o nome do cartão."); return }
    if (cartaoFinal && !/^\d{4}$/.test(cartaoFinal)) { toast.error("Os últimos dígitos devem ter exatamente 4 números."); return }
    setSaving(true)
    try {
      const { error } = await supabase.from("financeiro_cartoes").insert({
        conta_id: cartaoContaId,
        nome: cartaoNome.trim(),
        modalidade: cartaoModalidade,
        bandeira: cartaoBandeira.trim() || null,
        final_4: cartaoFinal || null,
      })
      if (error) throw error
      setCartaoNome("")
      setCartaoBandeira("")
      setCartaoFinal("")
      await carregar()
      toast.success("Cartão cadastrado.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar o cartão.")
    } finally { setSaving(false) }
  }

  async function atualizarConta(conta: Conta, patch: Partial<Conta>) {
    const { error } = await supabase.from("financeiro_contas_pagamento").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", conta.id)
    if (error) { toast.error(error.message); return }
    await carregar()
  }

  async function atualizarCartao(cartao: Cartao, patch: Partial<Cartao>) {
    const { error } = await supabase.from("financeiro_cartoes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", cartao.id)
    if (error) { toast.error(error.message); return }
    await carregar()
  }

  if (loading || !admin) return null

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 font-heading"><WalletCards className="size-5 text-primary" />Meios de pagamento</CardTitle>
            <CardDescription>Somente administradores. Dinheiro é uma opção fixa; aqui você cadastra contas, PIX e cartões usados pela empresa.</CardDescription>
          </div>
          <Badge variant="outline">Administrador</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-4 rounded-xl border p-4">
          <div className="flex items-center gap-2 font-semibold"><Building2 className="size-4" />Contas e bancos</div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="grid gap-1.5"><Label>Nome</Label><Input value={novoBanco} onChange={(e) => setNovoBanco(e.target.value)} placeholder="Ex.: Banco Inter, Mercado Pago" /></div>
            <Button type="button" variant={novoPix ? "default" : "outline"} onClick={() => setNovoPix((v) => !v)}>{novoPix ? "PIX habilitado" : "Sem PIX"}</Button>
            <Button type="button" onClick={adicionarBanco} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Adicionar</Button>
          </div>
          <div className="grid gap-2">
            {contas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p> : contas.map((conta) => (
              <div key={conta.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/30 p-3">
                <div><p className="font-medium">{conta.nome}</p><p className="text-xs text-muted-foreground">{conta.pix_habilitado ? "PIX disponível" : "PIX desativado"}</p></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => atualizarConta(conta, { pix_habilitado: !conta.pix_habilitado })}>{conta.pix_habilitado ? "Desativar PIX" : "Ativar PIX"}</Button>
                  <Button size="sm" variant={conta.ativo ? "outline" : "secondary"} onClick={() => atualizarConta(conta, { ativo: !conta.ativo })}>{conta.ativo ? "Inativar" : "Reativar"}</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 rounded-xl border p-4">
          <div className="flex items-center gap-2 font-semibold"><CreditCard className="size-4" />Cartões</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="grid gap-1.5"><Label>Conta / banco</Label><Select value={cartaoContaId} onValueChange={(v) => setCartaoContaId(v ?? "")}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{contasAtivas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-1.5"><Label>Nome do cartão</Label><Input value={cartaoNome} onChange={(e) => setCartaoNome(e.target.value)} placeholder="Ex.: Inter Mastercard" /></div>
            <div className="grid gap-1.5"><Label>Modalidade</Label><Select value={cartaoModalidade} onValueChange={(v) => setCartaoModalidade((v as "debito" | "credito") || "credito")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="debito">Débito</SelectItem><SelectItem value="credito">Crédito</SelectItem></SelectContent></Select></div>
            <div className="grid gap-1.5"><Label>Bandeira / final</Label><div className="flex gap-2"><Input value={cartaoBandeira} onChange={(e) => setCartaoBandeira(e.target.value)} placeholder="Mastercard" /><Input className="w-24" maxLength={4} value={cartaoFinal} onChange={(e) => setCartaoFinal(e.target.value.replace(/\D/g, ""))} placeholder="1234" /></div></div>
            <div className="flex items-end"><Button className="w-full" type="button" onClick={adicionarCartao} disabled={saving}><Plus className="size-4" />Adicionar cartão</Button></div>
          </div>
          <div className="grid gap-2">
            {cartoes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum cartão cadastrado.</p> : cartoes.map((cartao) => {
              const conta = contas.find((c) => c.id === cartao.conta_id)
              return <div key={cartao.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/30 p-3"><div><p className="font-medium">{cartao.nome}</p><p className="text-xs text-muted-foreground">{cartao.modalidade === "credito" ? "Crédito" : "Débito"} · {conta?.nome || "Conta"}{cartao.bandeira ? ` · ${cartao.bandeira}` : ""}{cartao.final_4 ? ` · final ${cartao.final_4}` : ""}</p></div><Button size="sm" variant={cartao.ativo ? "outline" : "secondary"} onClick={() => atualizarCartao(cartao, { ativo: !cartao.ativo })}>{cartao.ativo ? "Inativar" : "Reativar"}</Button></div>
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
