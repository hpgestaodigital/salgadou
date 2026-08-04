"use client"

import { useEffect, useMemo, useState } from "react"
import { BellRing, CheckCircle2, Loader2, Save, UsersRound, Wifi, WifiOff } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useTable } from "@/lib/use-data"
import type { Colaborador, Configuracao } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const CHAVES = {
  escala: "lembrete_destinatarios_escala",
  fornecedor: "lembrete_destinatarios_fornecedor",
  fornecedorExterno: "lembrete_fornecedor_incluir_fornecedor",
  motoboy: "lembrete_destinatarios_motoboy",
} as const

type Grupo = "escala" | "fornecedor" | "motoboy"

type EstadoEvolution = {
  configured?: boolean
  connected?: boolean
  state?: string
}

function lerIds(valor: string | null | undefined) {
  try {
    const ids = JSON.parse(valor || "[]")
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

export function ReminderRecipientSettings() {
  const supabase = createClient()
  const { data: colaboradores } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const { data: configuracoes, mutate } = useTable<Configuracao>("configuracoes")
  const [selecionados, setSelecionados] = useState<Record<Grupo, string[]>>({
    escala: [],
    fornecedor: [],
    motoboy: [],
  })
  const [incluirFornecedor, setIncluirFornecedor] = useState(true)
  const [inicializado, setInicializado] = useState(false)
  const [saving, setSaving] = useState(false)
  const [estado, setEstado] = useState<EstadoEvolution>({})
  const [consultandoEstado, setConsultandoEstado] = useState(true)

  const pessoas = useMemo(
    () => colaboradores.filter((pessoa) => pessoa.ativo && pessoa.whatsapp?.trim()),
    [colaboradores],
  )
  const pessoasEscala = useMemo(
    () => pessoas.filter((pessoa) => pessoa.participa_escala !== false),
    [pessoas],
  )

  useEffect(() => {
    if (inicializado || configuracoes.length === 0) return
    const mapa = Object.fromEntries(configuracoes.map((item) => [item.chave, item.valor])) as Record<string, string | null>
    setSelecionados({
      escala: lerIds(mapa[CHAVES.escala]),
      fornecedor: lerIds(mapa[CHAVES.fornecedor]),
      motoboy: lerIds(mapa[CHAVES.motoboy]),
    })
    setIncluirFornecedor(mapa[CHAVES.fornecedorExterno] !== "false")
    setInicializado(true)
  }, [configuracoes, inicializado])

  async function consultarEstado() {
    setConsultandoEstado(true)
    try {
      const resposta = await fetch("/api/notifications/status", { cache: "no-store" })
      const json = await resposta.json().catch(() => ({}))
      setEstado(json)
    } finally {
      setConsultandoEstado(false)
    }
  }

  useEffect(() => {
    void consultarEstado()
  }, [])

  function alternar(grupo: Grupo, id: string) {
    setSelecionados((atual) => ({
      ...atual,
      [grupo]: atual[grupo].includes(id)
        ? atual[grupo].filter((item) => item !== id)
        : [...atual[grupo], id],
    }))
  }

  function definirTodos(grupo: Grupo, ids: string[]) {
    setSelecionados((atual) => ({ ...atual, [grupo]: ids }))
  }

  async function salvar() {
    setSaving(true)
    try {
      const agora = new Date().toISOString()
      const { error } = await supabase.from("configuracoes").upsert([
        { chave: CHAVES.escala, valor: JSON.stringify(selecionados.escala), updated_at: agora },
        { chave: CHAVES.fornecedor, valor: JSON.stringify(selecionados.fornecedor), updated_at: agora },
        { chave: CHAVES.fornecedorExterno, valor: String(incluirFornecedor), updated_at: agora },
        { chave: CHAVES.motoboy, valor: JSON.stringify(selecionados.motoboy), updated_at: agora },
      ], { onConflict: "chave" })
      if (error) throw error
      await mutate()
      toast.success("Destinatários padrão dos lembretes foram salvos.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar os destinatários.")
    } finally {
      setSaving(false)
    }
  }

  const statusLabel = !estado.configured
    ? "Não configurada"
    : estado.connected
      ? "WhatsApp conectado"
      : `Configurada · ${estado.state || "sem conexão"}`

  return (
    <Card className="mt-6">
      <CardHeader className="gap-3 border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 font-heading">
              <BellRing className="size-5 text-primary" />
              Destinatários dos lembretes
            </CardTitle>
            <CardDescription className="mt-1">
              Defina várias pessoas como padrão. Antes de cada envio será possível revisar e alterar a seleção.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={estado.connected ? "default" : "secondary"} className="gap-1.5">
              {consultandoEstado ? <Loader2 className="size-3 animate-spin" /> : estado.connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
              {consultandoEstado ? "Verificando Evolution" : statusLabel}
            </Badge>
            <Button type="button" variant="outline" size="sm" onClick={consultarEstado} disabled={consultandoEstado}>
              Verificar conexão
            </Button>
            <Button type="button" size="sm" onClick={salvar} disabled={saving || !inicializado}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salvar destinatários
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 p-5 lg:grid-cols-3">
        <RecipientGroup
          titulo="Escala semanal"
          descricao="Escolha quem fica pré-selecionado ao enviar a escala. Pessoas fora da escala não aparecem."
          pessoas={pessoasEscala}
          selecionados={selecionados.escala}
          onToggle={(id) => alternar("escala", id)}
          onTodos={() => definirTodos("escala", pessoasEscala.map((pessoa) => pessoa.id))}
          onLimpar={() => definirTodos("escala", [])}
        />
        <RecipientGroup
          titulo="Pagamento de fornecedor"
          descricao="Os responsáveis internos podem receber junto com o contato do fornecedor."
          pessoas={pessoas}
          selecionados={selecionados.fornecedor}
          onToggle={(id) => alternar("fornecedor", id)}
          onTodos={() => definirTodos("fornecedor", pessoas.map((pessoa) => pessoa.id))}
          onLimpar={() => definirTodos("fornecedor", [])}
          extra={
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={incluirFornecedor}
                onChange={(event) => setIncluirFornecedor(event.target.checked)}
              />
              <span>
                <span className="block font-semibold">Incluir o fornecedor</span>
                <span className="block text-xs text-muted-foreground">Usa o WhatsApp salvo no cadastro do fornecedor.</span>
              </span>
            </label>
          }
        />
        <RecipientGroup
          titulo="Pagamento de motoboy"
          descricao="O motoboy é sempre incluído. Selecione também os responsáveis internos pelo pagamento."
          pessoas={pessoas}
          selecionados={selecionados.motoboy}
          onToggle={(id) => alternar("motoboy", id)}
          onTodos={() => definirTodos("motoboy", pessoas.map((pessoa) => pessoa.id))}
          onLimpar={() => definirTodos("motoboy", [])}
          extra={
            <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-semibold">Motoboy obrigatório</p>
                <p className="text-xs text-muted-foreground">O contato do lançamento não pode ser removido do envio.</p>
              </div>
            </div>
          }
        />
      </CardContent>
    </Card>
  )
}

function RecipientGroup({
  titulo,
  descricao,
  pessoas,
  selecionados,
  onToggle,
  onTodos,
  onLimpar,
  extra,
}: {
  titulo: string
  descricao: string
  pessoas: Colaborador[]
  selecionados: string[]
  onToggle: (id: string) => void
  onTodos: () => void
  onLimpar: () => void
  extra?: React.ReactNode
}) {
  return (
    <section className="flex min-h-[360px] flex-col rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-heading font-bold"><UsersRound className="size-4 text-primary" />{titulo}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{descricao}</p>
        </div>
        <Badge variant="outline">{selecionados.length}</Badge>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onTodos}>Todos</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onLimpar}>Limpar</Button>
      </div>
      {extra && <div className="mt-3">{extra}</div>}
      <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto pr-1">
        {pessoas.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Nenhuma pessoa ativa com WhatsApp disponível.
          </p>
        ) : pessoas.map((pessoa) => (
          <label key={pessoa.id} className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/30">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={selecionados.includes(pessoa.id)}
              onChange={() => onToggle(pessoa.id)}
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{pessoa.nome}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{pessoa.whatsapp}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  )
}
