"use client"

import Link from "next/link"
import useSWR, { useSWRConfig } from "swr"
import { ArrowLeft, Loader2, ReceiptText } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { MercadoNoteReaderV2 } from "@/components/mercado-note-reader-v2"
import type { Fornecedor } from "@/lib/types"

type Insumo = { id: string; nome: string; unidade: string; ativo: boolean }

export function MercadoNotasView() {
  const supabase = createClient()
  const { mutate } = useSWRConfig()

  const { data: fornecedores, isLoading: carregandoFornecedores } = useSWR<Fornecedor[]>("fornecedores:mercado:notas", async () => {
    const { data, error } = await supabase.from("fornecedores").select("*").order("nome")
    if (error) throw error
    return (data ?? []) as Fornecedor[]
  })

  const { data: insumos, isLoading: carregandoInsumos } = useSWR<Insumo[]>("producao_insumos:mercado:notas", async () => {
    const { data, error } = await supabase.from("producao_insumos").select("id,nome,unidade,ativo").eq("ativo", true).order("nome")
    if (error) throw error
    return (data ?? []) as Insumo[]
  })

  const carregando = carregandoFornecedores || carregandoInsumos

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><ReceiptText className="size-4" />Mercado</div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Notas fiscais</h1>
          <p className="mt-1 text-sm text-muted-foreground">Envie foto, PDF ou XML, confira itens e forma de pagamento e só então registre a entrada no estoque.</p>
        </div>
        <Button asChild variant="outline"><Link href="/mercado"><ArrowLeft className="size-4" />Voltar ao Mercado</Link></Button>
      </div>

      {carregando ? (
        <div className="grid h-48 place-items-center rounded-xl border"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <MercadoNoteReaderV2
          fornecedores={fornecedores ?? []}
          insumos={insumos ?? []}
          onSalvo={() => {
            void mutate("mercado_compras")
            void mutate("producao_insumos:mercado")
            void mutate("producao_insumos:mercado:notas")
          }}
        />
      )}
    </div>
  )
}
