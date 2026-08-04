"use client"

import { useMemo, useState } from "react"
import { BellRing, CalendarDays, CheckCircle2, Loader2, Send, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { useTable } from "@/lib/use-data"
import type {
  Colaborador,
  Configuracao,
  Escala,
  Fornecedor,
  Motoboy,
  PagamentoFornecedor,
  PagamentoMotoboy,
} from "@/lib/types"
import { formatBRL, formatDate, mondayOf, todayISO, weekLabel } from "@/lib/format"
import { preencherTemplate, TEMPLATE_KEYS } from "@/lib/whatsapp"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type ReminderPageType = "escala" | "fornecedor" | "motoboy"

type Recipient = {
  id: string
  nome: string
  numero: string
  detalhe: string
  locked?: boolean
}

type ContextoEnvio = "escala" | "pagamento_fornecedor" | "pagamento_motoboy"

const CHAVES = {
  escalaIds: "lembrete_destinatarios_escala",
  fornecedorIds: "lembrete_destinatarios_fornecedor",
  fornecedorExterno: "lembrete_fornecedor_incluir_fornecedor",
  motoboyIds: "lembrete_destinatarios_motoboy",
} as const

function configMap(configuracoes: Configuracao[]) {
  return Object.fromEntries(configuracoes.map((item) => [item.chave, item.valor])) as Record<string, string | null>
}

function lerIds(valor: string | null | undefined) {
  try {
    const ids = JSON.parse(valor || "[]")
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

function normalizar(valor: string | null | undefined) {
  return (valor || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

async function enviarLote(
  contexto: ContextoEnvio,
  mensagens: { numero: string; mensagem: string }[],
) {
  const resposta = await fetch("/api/whatsapp/enviar-lote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contexto, mensagens }),
  })
  const json = await resposta.json().catch(() => ({}))
  if (!resposta.ok) throw new Error(json.error || "Não foi possível enviar os lembretes.")
  return json as { total: number; enviados: number; falhas: number }
}

export function ReminderSendLauncher({ tipo }: { tipo: ReminderPageType }) {
  if (tipo === "escala") return <ScaleReminderLauncher />
  if (tipo === "fornecedor") return <SupplierReminderLauncher />
  return <MotoboyReminderLauncher />
}

function ScaleReminderLauncher() {
  const { data: colaboradores } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const { data: escalas } = useTable<Escala>("escala")
  const { data: configuracoes } = useTable<Configuracao>("configuracoes")
  const [open, setOpen] = useState(false)
  const [semana, setSemana] = useState(mondayOf(todayISO()))
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)

  const candidatos = useMemo(() => {
    const idsComHorario = new Set(
      escalas
        .filter((item) => item.semana_inicio === semana && [item.seg, item.ter, item.qua, item.qui, item.sex, item.sab, item.dom].some((valor) => valor?.trim()))
        .map((item) => item.colaborador_id),
    )
    return colaboradores
      .filter((pessoa) => pessoa.ativo && pessoa.participa_escala !== false && pessoa.whatsapp?.trim() && idsComHorario.has(pessoa.id))
      .map((pessoa) => ({
        id: pessoa.id,
        nome: pessoa.nome,
        numero: pessoa.whatsapp as string,
        detalhe: pessoa.funcao || "Escala da semana",
      }))
  }, [colaboradores, escalas, semana])

  function selecionarPadrao(novosCandidatos = candidatos) {
    const mapa = configMap(configuracoes)
    const padrao = lerIds(mapa[CHAVES.escalaIds]).filter((id) => novosCandidatos.some((pessoa) => pessoa.id === id))
    setSelecionados(padrao.length ? padrao : novosCandidatos.map((pessoa) => pessoa.id))
  }

  function abrir() {
    selecionarPadrao()
    setOpen(true)
  }

  function alterarSemana(valor: string) {
    const novaSemana = mondayOf(valor || todayISO())
    setSemana(novaSemana)
    const idsComHorario = new Set(
      escalas
        .filter((item) => item.semana_inicio === novaSemana && [item.seg, item.ter, item.qua, item.qui, item.sex, item.sab, item.dom].some((horario) => horario?.trim()))
        .map((item) => item.colaborador_id),
    )
    const novos = colaboradores
      .filter((pessoa) => pessoa.ativo && pessoa.participa_escala !== false && pessoa.whatsapp?.trim() && idsComHorario.has(pessoa.id))
      .map((pessoa) => ({ id: pessoa.id }))
    const mapa = configMap(configuracoes)
    const padrao = lerIds(mapa[CHAVES.escalaIds]).filter((id) => novos.some((pessoa) => pessoa.id === id))
    setSelecionados(padrao.length ? padrao : novos.map((pessoa) => pessoa.id))
  }

  async function enviar() {
    const destinos = candidatos.filter((pessoa) => selecionados.includes(pessoa.id))
    if (!destinos.length) return toast.error("Selecione ao menos uma pessoa com horário nesta semana.")
    const mapa = configMap(configuracoes)
    const template = mapa[TEMPLATE_KEYS.escala] || "Olá {nome}! Lembrete da Salgadou: você tem escala nesta semana. Confira seus horários."
    setEnviando(true)
    try {
      const resultado = await enviarLote("escala", destinos.map((pessoa) => ({
        numero: pessoa.numero,
        mensagem: preencherTemplate(template, { nome: pessoa.nome, semana: weekLabel(semana) }),
      })))
      toast.success(`Lembretes enviados: ${resultado.enviados}.${resultado.falhas ? ` Falhas: ${resultado.falhas}.` : ""}`)
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no envio.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <FloatingReminderButton onClick={abrir} label="Enviar lembretes da escala" />
      <RecipientDialog
        open={open}
        onOpenChange={setOpen}
        titulo="Enviar lembretes da escala"
        descricao="Escolha uma ou mais pessoas que possuem horário registrado na semana selecionada."
        recipients={candidatos}
        selecionados={selecionados}
        setSelecionados={setSelecionados}
        enviando={enviando}
        onEnviar={enviar}
        extra={
          <div className="grid gap-1.5">
            <Label htmlFor="semana-lembrete">Semana</Label>
            <Input id="semana-lembrete" type="date" value={semana} onChange={(event) => alterarSemana(event.target.value)} />
            <p className="text-xs text-muted-foreground">{weekLabel(semana)}</p>
          </div>
        }
      />
    </>
  )
}

function SupplierReminderLauncher() {
  const { data: pagamentos } = useTable<PagamentoFornecedor>("pagamentos_fornecedores", { column: "vencimento" })
  const { data: fornecedores } = useTable<Fornecedor>("fornecedores", { column: "nome" })
  const { data: colaboradores } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const { data: configuracoes } = useTable<Configuracao>("configuracoes")
  const [open, setOpen] = useState(false)
  const [pagamentoId, setPagamentoId] = useState("")
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)

  const ordenados = useMemo(
    () => [...pagamentos].sort((a, b) => Number(Boolean(a.pago_em)) - Number(Boolean(b.pago_em)) || a.vencimento.localeCompare(b.vencimento)),
    [pagamentos],
  )
  const pagamento = ordenados.find((item) => item.id === pagamentoId) || null

  const recipients = useMemo(() => montarDestinosFornecedor(pagamento, fornecedores, colaboradores), [pagamento, fornecedores, colaboradores])

  function definirPadrao(id: string) {
    const proximo = ordenados.find((item) => item.id === id) || null
    const destinos = montarDestinosFornecedor(proximo, fornecedores, colaboradores)
    const mapa = configMap(configuracoes)
    const ids = new Set(lerIds(mapa[CHAVES.fornecedorIds]))
    if (proximo?.responsavel) {
      colaboradores.filter((pessoa) => normalizar(pessoa.nome) === normalizar(proximo.responsavel)).forEach((pessoa) => ids.add(pessoa.id))
    }
    if (mapa[CHAVES.fornecedorExterno] !== "false") {
      destinos.filter((destino) => destino.id.startsWith("fornecedor:")).forEach((destino) => ids.add(destino.id))
    }
    setSelecionados(destinos.filter((destino) => ids.has(destino.id)).map((destino) => destino.id))
  }

  function abrir() {
    const id = ordenados.find((item) => !item.pago_em)?.id || ordenados[0]?.id || ""
    setPagamentoId(id)
    definirPadrao(id)
    setOpen(true)
  }

  function alterarPagamento(id: string) {
    setPagamentoId(id)
    definirPadrao(id)
  }

  async function enviar() {
    if (!pagamento) return toast.error("Selecione um pagamento.")
    const destinos = recipients.filter((pessoa) => selecionados.includes(pessoa.id))
    if (!destinos.length) return toast.error("Selecione ao menos um destinatário.")
    const mapa = configMap(configuracoes)
    const template = mapa[TEMPLATE_KEYS.fornecedor] || "Olá! Lembrete do pagamento do pedido {pedido} para {fornecedor} no valor de {valor}, com vencimento em {vencimento}."
    setEnviando(true)
    try {
      const resultado = await enviarLote("pagamento_fornecedor", destinos.map((pessoa) => ({
        numero: pessoa.numero,
        mensagem: preencherTemplate(template, {
          nome: pessoa.nome,
          fornecedor: pagamento.fornecedor,
          pedido: pagamento.pedido || "—",
          valor: formatBRL(pagamento.valor),
          vencimento: formatDate(pagamento.vencimento),
        }),
      })))
      toast.success(`Lembretes enviados: ${resultado.enviados}.${resultado.falhas ? ` Falhas: ${resultado.falhas}.` : ""}`)
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no envio.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <FloatingReminderButton onClick={abrir} label="Enviar lembrete de fornecedor" disabled={ordenados.length === 0} />
      <RecipientDialog
        open={open}
        onOpenChange={setOpen}
        titulo="Lembrete de pagamento de fornecedor"
        descricao="Escolha o lançamento e marque o fornecedor, um ou vários responsáveis internos."
        recipients={recipients}
        selecionados={selecionados}
        setSelecionados={setSelecionados}
        enviando={enviando}
        onEnviar={enviar}
        extra={
          <div className="grid gap-1.5">
            <Label htmlFor="pagamento-fornecedor-lembrete">Pagamento</Label>
            <select
              id="pagamento-fornecedor-lembrete"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={pagamentoId}
              onChange={(event) => alterarPagamento(event.target.value)}
            >
              <option value="">Selecione</option>
              {ordenados.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fornecedor} · {formatBRL(item.valor)} · {formatDate(item.vencimento)}{item.pago_em ? " · pago" : ""}
                </option>
              ))}
            </select>
          </div>
        }
      />
    </>
  )
}

function MotoboyReminderLauncher() {
  const { data: pagamentos } = useTable<PagamentoMotoboy>("pagamentos_motoboys", { column: "data", ascending: false })
  const { data: motoboys } = useTable<Motoboy>("motoboys", { column: "nome" })
  const { data: colaboradores } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const { data: configuracoes } = useTable<Configuracao>("configuracoes")
  const [open, setOpen] = useState(false)
  const [pagamentoId, setPagamentoId] = useState("")
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)

  const ordenados = useMemo(
    () => [...pagamentos].sort((a, b) => Number(Boolean(a.pago_em)) - Number(Boolean(b.pago_em)) || b.data.localeCompare(a.data)),
    [pagamentos],
  )
  const pagamento = ordenados.find((item) => item.id === pagamentoId) || null
  const recipients = useMemo(() => montarDestinosMotoboy(pagamento, motoboys, colaboradores), [pagamento, motoboys, colaboradores])

  function definirPadrao(id: string) {
    const proximo = ordenados.find((item) => item.id === id) || null
    const destinos = montarDestinosMotoboy(proximo, motoboys, colaboradores)
    const mapa = configMap(configuracoes)
    const ids = new Set(lerIds(mapa[CHAVES.motoboyIds]))
    if (proximo?.responsavel) {
      colaboradores.filter((pessoa) => normalizar(pessoa.nome) === normalizar(proximo.responsavel)).forEach((pessoa) => ids.add(pessoa.id))
    }
    destinos.filter((destino) => destino.locked).forEach((destino) => ids.add(destino.id))
    setSelecionados(destinos.filter((destino) => ids.has(destino.id)).map((destino) => destino.id))
  }

  function abrir() {
    const id = ordenados.find((item) => !item.pago_em)?.id || ordenados[0]?.id || ""
    setPagamentoId(id)
    definirPadrao(id)
    setOpen(true)
  }

  function alterarPagamento(id: string) {
    setPagamentoId(id)
    definirPadrao(id)
  }

  function setSelecionadosProtegidos(ids: string[]) {
    const obrigatorios = recipients.filter((destino) => destino.locked).map((destino) => destino.id)
    setSelecionados(Array.from(new Set([...ids, ...obrigatorios])))
  }

  async function enviar() {
    if (!pagamento) return toast.error("Selecione um pagamento.")
    const destinos = recipients.filter((pessoa) => selecionados.includes(pessoa.id))
    const motoboy = destinos.find((destino) => destino.locked)
    if (!motoboy) return toast.error("O motoboy precisa ter WhatsApp cadastrado para receber o fechamento.")
    const mapa = configMap(configuracoes)
    const template = mapa[TEMPLATE_KEYS.motoboy] || "Olá {nome}! Salgadou: fechamento do dia {data} - {entregas} entregas. Total a receber: {total}. PIX: {pix}."
    setEnviando(true)
    try {
      const resultado = await enviarLote("pagamento_motoboy", destinos.map((pessoa) => ({
        numero: pessoa.numero,
        mensagem: preencherTemplate(template, {
          nome: pessoa.nome,
          motoboy: pagamento.motoboy_nome || motoboy.nome,
          data: formatDate(pagamento.data),
          entregas: pagamento.numero_entregas || 0,
          total: formatBRL(pagamento.total),
          pix: pagamento.pix || "",
        }),
      })))
      toast.success(`Fechamento enviado ao motoboy e responsáveis: ${resultado.enviados}.${resultado.falhas ? ` Falhas: ${resultado.falhas}.` : ""}`)
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no envio.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <FloatingReminderButton onClick={abrir} label="Enviar fechamento do motoboy" disabled={ordenados.length === 0} />
      <RecipientDialog
        open={open}
        onOpenChange={setOpen}
        titulo="Enviar fechamento do motoboy"
        descricao="O motoboy é obrigatório. Marque também um ou vários responsáveis internos pelo pagamento."
        recipients={recipients}
        selecionados={selecionados}
        setSelecionados={setSelecionadosProtegidos}
        enviando={enviando}
        onEnviar={enviar}
        extra={
          <div className="grid gap-1.5">
            <Label htmlFor="pagamento-motoboy-lembrete">Fechamento</Label>
            <select
              id="pagamento-motoboy-lembrete"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={pagamentoId}
              onChange={(event) => alterarPagamento(event.target.value)}
            >
              <option value="">Selecione</option>
              {ordenados.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.motoboy_nome || "Motoboy"} · {formatDate(item.data)} · {formatBRL(item.total)}{item.pago_em ? " · pago" : ""}
                </option>
              ))}
            </select>
          </div>
        }
      />
    </>
  )
}

function montarDestinosFornecedor(
  pagamento: PagamentoFornecedor | null,
  fornecedores: Fornecedor[],
  colaboradores: Colaborador[],
): Recipient[] {
  if (!pagamento) return []
  const fornecedor = fornecedores.find((item) => normalizar(item.nome) === normalizar(pagamento.fornecedor))
  const externos: Recipient[] = fornecedor?.whatsapp?.trim() ? [{
    id: `fornecedor:${fornecedor.id}`,
    nome: fornecedor.nome,
    numero: fornecedor.whatsapp,
    detalhe: "Fornecedor do lançamento",
  }] : []
  const internos = colaboradores
    .filter((pessoa) => pessoa.ativo && pessoa.whatsapp?.trim())
    .map((pessoa) => ({ id: pessoa.id, nome: pessoa.nome, numero: pessoa.whatsapp as string, detalhe: "Responsável interno" }))
  return [...externos, ...internos]
}

function montarDestinosMotoboy(
  pagamento: PagamentoMotoboy | null,
  motoboys: Motoboy[],
  colaboradores: Colaborador[],
): Recipient[] {
  if (!pagamento) return []
  const motoboy = motoboys.find((item) => item.id === pagamento.motoboy_id)
  const externo: Recipient[] = motoboy?.whatsapp?.trim() ? [{
    id: `motoboy:${motoboy.id}`,
    nome: motoboy.nome,
    numero: motoboy.whatsapp,
    detalhe: "Motoboy · destinatário obrigatório",
    locked: true,
  }] : []
  const internos = colaboradores
    .filter((pessoa) => pessoa.ativo && pessoa.whatsapp?.trim())
    .map((pessoa) => ({ id: pessoa.id, nome: pessoa.nome, numero: pessoa.whatsapp as string, detalhe: "Responsável interno" }))
  return [...externo, ...internos]
}

function FloatingReminderButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="fixed bottom-5 right-5 z-40 gap-2 rounded-full px-5 shadow-xl sm:bottom-7 sm:right-7"
    >
      <BellRing className="size-4" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">Lembretes</span>
    </Button>
  )
}

function RecipientDialog({
  open,
  onOpenChange,
  titulo,
  descricao,
  recipients,
  selecionados,
  setSelecionados,
  enviando,
  onEnviar,
  extra,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  descricao: string
  recipients: Recipient[]
  selecionados: string[]
  setSelecionados: (ids: string[]) => void
  enviando: boolean
  onEnviar: () => void
  extra?: React.ReactNode
}) {
  function alternar(recipient: Recipient) {
    if (recipient.locked) return
    setSelecionados(
      selecionados.includes(recipient.id)
        ? selecionados.filter((id) => id !== recipient.id)
        : [...selecionados, recipient.id],
    )
  }

  const selecionaveis = recipients.filter((recipient) => !recipient.locked)
  const todosSelecionados = selecionaveis.length > 0 && selecionaveis.every((recipient) => selecionados.includes(recipient.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="size-5 text-primary" />{titulo}</DialogTitle>
          <p className="text-sm text-muted-foreground">{descricao}</p>
        </DialogHeader>
        <div className="grid gap-4">
          {extra}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UsersRound className="size-4 text-primary" />
              Destinatários
              <Badge variant="outline">{selecionados.length}</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSelecionados(todosSelecionados
                  ? recipients.filter((recipient) => recipient.locked).map((recipient) => recipient.id)
                  : recipients.map((recipient) => recipient.id))}
              >
                {todosSelecionados ? "Limpar opcionais" : "Selecionar todos"}
              </Button>
            </div>
          </div>
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
            {recipients.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum destinatário com WhatsApp disponível para este lançamento.
              </p>
            ) : recipients.map((recipient) => (
              <label
                key={recipient.id}
                className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${recipient.locked ? "cursor-not-allowed border-primary/25 bg-primary/5" : "cursor-pointer hover:bg-muted/30"}`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selecionados.includes(recipient.id)}
                  disabled={recipient.locked}
                  onChange={() => alternar(recipient)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{recipient.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">{recipient.detalhe} · {recipient.numero}</span>
                </span>
                {recipient.locked && <CheckCircle2 className="size-4 shrink-0 text-primary" />}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={onEnviar} disabled={enviando || selecionados.length === 0}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Enviar para {selecionados.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
