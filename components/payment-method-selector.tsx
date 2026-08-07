"use client"

import { useEffect, useMemo, useState } from "react"
import { Banknote, CreditCard, Landmark, QrCode } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Tipo = "dinheiro" | "pix" | "debito" | "credito" | "outro" | ""
type Conta = { id: string; nome: string; pix_habilitado: boolean; ativo: boolean }
type Cartao = { id: string; conta_id: string; nome: string; modalidade: "debito" | "credito"; bandeira: string | null; final_4: string | null; ativo: boolean }

export type PaymentSelection = {
  tipo: Tipo
  contaId: string
  cartaoId: string
  detalheLido: string
}

function normalizar(v: string | null | undefined) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export function PaymentMethodSelector({
  value,
  onChange,
  suggestedType,
  suggestedDetail,
  confidence,
}: {
  value: PaymentSelection
  onChange: (next: PaymentSelection) => void
  suggestedType?: Tipo | null
  suggestedDetail?: string | null
  confidence?: number
}) {
  const supabase = createClient()
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from("financeiro_contas_pagamento").select("id,nome,pix_habilitado,ativo").eq("ativo", true).order("nome"),
      supabase.from("financeiro_cartoes").select("id,conta_id,nome,modalidade,bandeira,final_4,ativo").eq("ativo", true).order("nome"),
    ]).then(([a, b]) => {
      if (!a.error) setContas((a.data ?? []) as Conta[])
      if (!b.error) setCartoes((b.data ?? []) as Cartao[])
    })
  }, [])

  useEffect(() => {
    if (value.tipo || !suggestedType) return
    let contaId = ""
    let cartaoId = ""
    const detalhe = normalizar(suggestedDetail)
    if (suggestedType === "pix") {
      const conta = contas.find((c) => detalhe.includes(normalizar(c.nome)))
      contaId = conta?.id || ""
    }
    if (suggestedType === "debito" || suggestedType === "credito") {
      const candidatos = cartoes.filter((c) => c.modalidade === suggestedType)
      const cartao = candidatos.find((c) => {
        const conta = contas.find((x) => x.id === c.conta_id)
        return detalhe.includes(normalizar(c.nome)) || (c.bandeira && detalhe.includes(normalizar(c.bandeira))) || (conta && detalhe.includes(normalizar(conta.nome)))
      })
      if (cartao) { cartaoId = cartao.id; contaId = cartao.conta_id }
    }
    onChange({ tipo: suggestedType, contaId, cartaoId, detalheLido: suggestedDetail || "" })
  }, [suggestedType, suggestedDetail, contas, cartoes])

  const cartoesFiltrados = useMemo(() => cartoes.filter((c) => c.modalidade === value.tipo), [cartoes, value.tipo])
  const contasPix = useMemo(() => contas.filter((c) => c.pix_habilitado), [contas])

  function mudarTipo(tipo: Tipo) {
    onChange({ tipo, contaId: "", cartaoId: "", detalheLido: value.detalheLido })
  }

  return (
    <div className="grid gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label className="text-base">Forma de pagamento</Label>
          <p className="text-xs text-muted-foreground">Sempre confira este campo, mesmo quando ele for sugerido pela nota.</p>
        </div>
        {suggestedType && <Badge variant="outline">Sugestão da nota{confidence ? ` · ${Math.round(confidence * 100)}%` : ""}</Badge>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-1.5">
          <Label>Modalidade</Label>
          <Select value={value.tipo} onValueChange={(v) => mudarTipo((v as Tipo) || "")}>
            <SelectTrigger><SelectValue placeholder="Selecione como foi pago" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dinheiro"><span className="inline-flex items-center gap-2"><Banknote className="size-4" />Dinheiro</span></SelectItem>
              <SelectItem value="pix"><span className="inline-flex items-center gap-2"><QrCode className="size-4" />PIX</span></SelectItem>
              <SelectItem value="debito"><span className="inline-flex items-center gap-2"><CreditCard className="size-4" />Cartão de débito</span></SelectItem>
              <SelectItem value="credito"><span className="inline-flex items-center gap-2"><CreditCard className="size-4" />Cartão de crédito</span></SelectItem>
              <SelectItem value="outro">Outro / não identificado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {value.tipo === "pix" && <div className="grid gap-1.5"><Label>Conta / banco do PIX</Label><Select value={value.contaId} onValueChange={(v) => onChange({ ...value, contaId: v ?? "", cartaoId: "" })}><SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger><SelectContent>{contasPix.map((c) => <SelectItem key={c.id} value={c.id}><span className="inline-flex items-center gap-2"><Landmark className="size-4" />{c.nome}</span></SelectItem>)}</SelectContent></Select></div>}

        {(value.tipo === "debito" || value.tipo === "credito") && <div className="grid gap-1.5"><Label>Cartão utilizado</Label><Select value={value.cartaoId} onValueChange={(v) => { const card = cartoes.find((c) => c.id === v); onChange({ ...value, cartaoId: v ?? "", contaId: card?.conta_id || "" }) }}><SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger><SelectContent>{cartoesFiltrados.map((c) => { const conta = contas.find((x) => x.id === c.conta_id); return <SelectItem key={c.id} value={c.id}>{c.nome}{conta ? ` · ${conta.nome}` : ""}{c.final_4 ? ` · ${c.final_4}` : ""}</SelectItem> })}</SelectContent></Select></div>}

        {suggestedDetail && <div className="grid gap-1.5"><Label>Detalhe lido na nota</Label><div className="flex min-h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">{suggestedDetail}</div></div>}
      </div>
    </div>
  )
}
