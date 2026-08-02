"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, ReceiptText, ShoppingBag, Upload, WalletCards } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { lerPlanilhaFinanceira, type PreviaPlanilha, type TipoPlanilha } from "@/lib/financeiro-excel"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Lancamento = {
  id: string; importacao_id: string; chave_origem: string; origem: TipoPlanilha; tipo: "entrada" | "saida"
  competencia: string; data_lancamento: string | null; categoria: string; descricao: string; valor: number
  quantidade: number | null; valor_unitario: number | null; pedidos: number | null; aba_origem: string
  linha_origem: number; observacoes: string | null
}

type Importacao = {
  id: string; tipo: TipoPlanilha; arquivo_nome: string; total_linhas: number; linhas_novas: number
  linhas_atualizadas: number; linhas_ignoradas: number; created_at: string
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })
const mesAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })

export function FinanceiroView() {
  const supabase = createClient()
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [previa, setPrevia] = useState<PreviaPlanilha | null>(null)
  const [analisando, setAnalisando] = useState<TipoPlanilha | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [schemaPronto, setSchemaPronto] = useState(true)
  const [competencia, setCompetencia] = useState("todas")
  const [origem, setOrigem] = useState<"todas" | TipoPlanilha>("todas")
  const [categoria, setCategoria] = useState("todas")
  const [paginaCustos, setPaginaCustos] = useState(0)

  async function carregar() {
    setCarregando(true)
    const [lista, historico] = await Promise.all([
      supabase.from("financeiro_lancamentos").select("*").order("competencia", { ascending: false }).order("linha_origem"),
      supabase.from("financeiro_importacoes").select("*").order("created_at", { ascending: false }).limit(12),
    ])
    const inexistente = lista.error?.code === "42P01" || historico.error?.code === "42P01"
    setSchemaPronto(!inexistente)
    if (!inexistente && (lista.error || historico.error)) toast.error("Não foi possível carregar os dados financeiros.")
    const registros = (lista.data ?? []) as Lancamento[]
    setLancamentos(registros)
    if (competencia === "todas") {
      const ultimaComEntrada = registros.filter((item) => item.tipo === "entrada").map((item) => item.competencia).sort().at(-1)
      if (ultimaComEntrada) setCompetencia(ultimaComEntrada)
    }
    setImportacoes((historico.data ?? []) as Importacao[])
    setCarregando(false)
  }

  useEffect(() => { void carregar() }, [])

  const existentes = useMemo(() => new Map(lancamentos.map((item) => [item.chave_origem, item])), [lancamentos])
  const contagemPrevia = useMemo(() => {
    if (!previa) return { novas: 0, atualizadas: 0 }
    let novas = 0; let atualizadas = 0
    for (const item of previa.lancamentos) {
      const atual = existentes.get(item.chave_origem)
      if (!atual) novas++
      else if (atual.valor !== item.valor || atual.descricao !== item.descricao || atual.data_lancamento !== item.data_lancamento) atualizadas++
    }
    return { novas, atualizadas }
  }, [existentes, previa])

  const competencias = useMemo(() => [...new Set(lancamentos.map((item) => item.competencia))].sort().reverse(), [lancamentos])
  const filtradosBase = useMemo(() => lancamentos.filter((item) =>
    (competencia === "todas" || item.competencia === competencia) && (origem === "todas" || item.origem === origem)
  ), [competencia, lancamentos, origem])
  const categorias = useMemo(() => [...new Set(filtradosBase.map((item) => item.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR")), [filtradosBase])
  const filtrados = useMemo(() => filtradosBase.filter((item) => categoria === "todas" || item.categoria === categoria), [categoria, filtradosBase])
  const baseResumo = useMemo(() => {
    const fluxo = filtrados.filter((item) => item.origem === "fluxo_caixa")
    return fluxo.length ? fluxo : filtrados
  }, [filtrados])
  const entradas = baseResumo.filter((item) => item.tipo === "entrada").reduce((soma, item) => soma + Number(item.valor), 0)
  const saidas = baseResumo.filter((item) => item.tipo === "saida").reduce((soma, item) => soma + Number(item.valor), 0)
  const pedidos = baseResumo.reduce((soma, item) => soma + Number(item.pedidos || 0), 0)
  const diasComPedidos = useMemo(() => filtrados.filter((item) => item.origem === "fluxo_caixa" && item.tipo === "entrada" && Number(item.pedidos) > 0)
    .sort((a, b) => (a.data_lancamento || "").localeCompare(b.data_lancamento || "")), [filtrados])
  const vendasComPedidos = diasComPedidos.reduce((soma, item) => soma + Number(item.valor), 0)
  const mediaPedidosDia = diasComPedidos.length ? pedidos / diasComPedidos.length : 0
  const ticketMedio = pedidos ? vendasComPedidos / pedidos : 0
  const maiorDia = diasComPedidos.reduce<Lancamento | null>((maior, item) => !maior || Number(item.pedidos) > Number(maior.pedidos) ? item : maior, null)
  const custosOrdenados = useMemo(() => {
    const saidasFiltradas = filtrados.filter((item) => item.tipo === "saida")
    const gastosDetalhados = saidasFiltradas.filter((item) => item.origem === "gastos")
    const fonte = origem === "todas" && gastosDetalhados.length ? gastosDetalhados : saidasFiltradas
    return [...fonte].sort((a, b) => Number(b.valor) - Number(a.valor))
  }, [filtrados, origem])
  const totalPaginasCustos = Math.max(1, Math.ceil(custosOrdenados.length / 5))
  const maioresCustos = custosOrdenados.slice(paginaCustos * 5, paginaCustos * 5 + 5)

  useEffect(() => {
    if (categoria !== "todas" && !categorias.includes(categoria)) setCategoria("todas")
  }, [categoria, categorias])

  useEffect(() => { setPaginaCustos(0) }, [categoria, competencia, origem])

  async function selecionarArquivo(event: React.ChangeEvent<HTMLInputElement>, tipo: TipoPlanilha) {
    const arquivo = event.target.files?.[0]
    event.target.value = ""
    if (!arquivo) return
    if (!/\.(xlsx|xlsm)$/i.test(arquivo.name)) return toast.error("Selecione um arquivo Excel .xlsx ou .xlsm.")
    if (arquivo.size > 10 * 1024 * 1024) return toast.error("O arquivo deve ter no máximo 10 MB.")
    setAnalisando(tipo); setPrevia(null)
    try {
      const resultado = await lerPlanilhaFinanceira(arquivo, tipo)
      if (!resultado.lancamentos.length) throw new Error("Nenhum lançamento reconhecido")
      setPrevia(resultado)
      toast.success(`${resultado.lancamentos.length} lançamentos reconhecidos.`)
    } catch (error) {
      console.error(error)
      toast.error("Não foi possível reconhecer essa planilha. Confira se ela segue o modelo apresentado.")
    } finally { setAnalisando(null) }
  }

  async function confirmarImportacao() {
    if (!previa || !schemaPronto) return
    setSalvando(true)
    let arquivoPath = ""
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Sessão expirada")
      const extensao = previa.arquivo.name.toLowerCase().endsWith(".xlsm") ? "xlsm" : "xlsx"
      arquivoPath = `imports/${user.id}/${crypto.randomUUID()}.${extensao}`
      const contentType = extensao === "xlsm" ? "application/vnd.ms-excel.sheet.macroEnabled.12" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      const upload = await supabase.storage.from("erp-financeiro").upload(arquivoPath, previa.arquivo, { contentType, upsert: false })
      if (upload.error) throw upload.error

      const resultado = await supabase.rpc("importar_planilha_financeira", {
        p_tipo: previa.tipo,
        p_arquivo_nome: previa.arquivo.name,
        p_arquivo_path: arquivoPath,
        p_arquivo_tamanho: previa.arquivo.size,
        p_abas: previa.abas,
        p_linhas_novas: contagemPrevia.novas,
        p_linhas_atualizadas: contagemPrevia.atualizadas,
        p_linhas_ignoradas: previa.ignoradas,
        p_lancamentos: previa.lancamentos,
      })
      if (resultado.error) throw resultado.error
      toast.success("Planilha importada com sucesso.")
      setPrevia(null)
      await carregar()
    } catch (error) {
      console.error(error)
      if (arquivoPath) await supabase.storage.from("erp-financeiro").remove([arquivoPath])
      toast.error(schemaPronto ? "A importação não foi salva. Nenhum dado parcial foi mantido." : "Aplique a migração do Financeiro no Supabase antes de importar.")
    } finally { setSalvando(false) }
  }

  return (
    <div className="space-y-7">
      <PageHeader title="Financeiro" description="Concentre os principais números sem abandonar as planilhas que o financeiro já utiliza." />

      <Card className="border-primary/20 bg-primary/[0.025]">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium">Período da análise</p><p className="text-sm text-muted-foreground">Este filtro atualiza todos os indicadores e detalhes abaixo.</p></div>
          <div className="w-full sm:w-64"><Label className="mb-1.5">Mês selecionado</Label><Select value={competencia} onValueChange={(valor) => valor && setCompetencia(valor)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todos os meses</SelectItem>{competencias.map((item) => <SelectItem key={item} value={item}>{mesAno.format(new Date(`${item}T00:00:00Z`))}</SelectItem>)}</SelectContent></Select></div>
        </CardContent>
      </Card>

      {!schemaPronto && <Card className="border-amber-500/35 bg-amber-500/5"><CardContent className="py-4 text-sm text-amber-100">
        A tela está pronta para demonstração e leitura dos arquivos. Para salvar, aplique a nova migração do Financeiro no Supabase.
      </CardContent></Card>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Entradas" value={moeda.format(entradas)} hint="Vendas reconhecidas no período" icon={ArrowUpCircle} tone="success" />
        <StatCard label="Saídas" value={moeda.format(saidas)} hint="Despesas consolidadas no período" icon={ArrowDownCircle} tone="warning" />
        <StatCard label="Saldo" value={moeda.format(entradas - saidas)} hint="Entradas menos saídas" icon={WalletCards} tone={entradas - saidas >= 0 ? "primary" : "warning"} />
        <StatCard label="Pedidos" value={pedidos.toLocaleString("pt-BR")} hint="Pedidos informados no fluxo de caixa" icon={FileSpreadsheet} />
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShoppingBag className="size-5 text-primary" />Detalhamento dos pedidos</CardTitle>
            <p className="text-sm text-muted-foreground">Indicadores diários calculados a partir do Fluxo de Caixa no período selecionado.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ResumoCompacto label="Total" valor={pedidos.toLocaleString("pt-BR")} />
              <ResumoCompacto label="Média por dia" valor={mediaPedidosDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} />
              <ResumoCompacto label="Ticket médio" valor={moeda.format(ticketMedio)} />
              <ResumoCompacto label="Dia de maior movimento" valor={maiorDia?.data_lancamento ? new Date(`${maiorDia.data_lancamento}T00:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "—"} detalhe={maiorDia ? `${Number(maiorDia.pedidos).toLocaleString("pt-BR")} pedidos` : undefined} />
            </div>
            {diasComPedidos.length ? <div className="max-h-72 overflow-auto rounded-xl border border-border/70">
              <Table><TableHeader><TableRow><TableHead>Dia</TableHead><TableHead className="text-right">Pedidos</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Ticket médio</TableHead></TableRow></TableHeader>
                <TableBody>{diasComPedidos.map((item) => <TableRow key={`pedido-${item.id}`}><TableCell>{item.data_lancamento ? new Date(`${item.data_lancamento}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : item.aba_origem}</TableCell><TableCell className="text-right font-medium">{Number(item.pedidos).toLocaleString("pt-BR")}</TableCell><TableCell className="text-right">{moeda.format(Number(item.valor))}</TableCell><TableCell className="text-right text-muted-foreground">{moeda.format(Number(item.valor) / Number(item.pedidos))}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div> : <EstadoAnaliseVazio texto="Não há pedidos informados para os filtros selecionados." />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ReceiptText className="size-5 text-amber-300" />Maiores custos</CardTitle>
            <p className="text-sm text-muted-foreground">Quando as duas planilhas estão selecionadas, usamos a planilha de Gastos para evitar valores duplicados.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {maioresCustos.length ? <ol className="space-y-3">{maioresCustos.map((item, indice) => <li key={`gasto-${item.id}`} className="flex items-start gap-3 rounded-xl border border-border/70 p-3.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-sm font-bold text-amber-300">{paginaCustos * 5 + indice + 1}</span>
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{item.descricao}</p><p className="mt-1 text-xs text-muted-foreground">{item.categoria} · {item.data_lancamento ? new Date(`${item.data_lancamento}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : `Planilha ${item.aba_origem}`}</p></div>
              <strong className="shrink-0 text-amber-300">{moeda.format(Number(item.valor))}</strong>
            </li>)}</ol> : <EstadoAnaliseVazio texto="Não há gastos para os filtros selecionados." />}
            {custosOrdenados.length > 5 && <div className="flex items-center justify-between border-t border-border/70 pt-4">
              <p className="text-xs text-muted-foreground">{paginaCustos * 5 + 1}–{Math.min((paginaCustos + 1) * 5, custosOrdenados.length)} de {custosOrdenados.length} custos</p>
              <div className="flex items-center gap-2"><Button type="button" variant="outline" size="icon" aria-label="Ver custos anteriores" disabled={paginaCustos === 0} onClick={() => setPaginaCustos((pagina) => Math.max(0, pagina - 1))}><ChevronLeft /></Button><span className="min-w-16 text-center text-xs text-muted-foreground">{paginaCustos + 1} de {totalPaginasCustos}</span><Button type="button" variant="outline" size="icon" aria-label="Ver próximos custos" disabled={paginaCustos >= totalPaginasCustos - 1} onClick={() => setPaginaCustos((pagina) => Math.min(totalPaginasCustos - 1, pagina + 1))}><ChevronRight /></Button></div>
            </div>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ImportCard tipo="fluxo_caixa" titulo="Fluxo de Caixa" descricao="Lê vendas diárias, pedidos, entradas e despesas consolidadas." analisando={analisando} onChange={selecionarArquivo} />
        <ImportCard tipo="gastos" titulo="Gastos" descricao="Lê ingredientes, materiais, pagamentos gerais e motoboys em detalhe." analisando={analisando} onChange={selecionarArquivo} />
      </section>

      {previa && <Card className="border-primary/30 bg-primary/[0.035]">
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-primary" />Prévia pronta para confirmar</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <PreviaNumero label="Reconhecidos" valor={previa.lancamentos.length} />
            <PreviaNumero label="Novos" valor={contagemPrevia.novas} />
            <PreviaNumero label="Atualizados" valor={contagemPrevia.atualizadas} />
            <PreviaNumero label="Abas encontradas" valor={previa.abas.length} />
          </div>
          <p className="text-sm text-muted-foreground">Arquivo: <strong className="text-foreground">{previa.arquivo.name}</strong>. A planilha original será guardada em área privada para auditoria.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirmarImportacao} disabled={salvando || !schemaPronto}>{salvando ? <Loader2 className="animate-spin" /> : <Upload />}Confirmar importação</Button>
            <Button variant="outline" onClick={() => setPrevia(null)} disabled={salvando}>Cancelar</Button>
          </div>
        </CardContent>
      </Card>}

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><CardTitle>Lançamentos reconhecidos</CardTitle><p className="mt-1 text-sm text-muted-foreground">O resumo usa o Fluxo de Caixa como fonte principal e a planilha de Gastos como detalhamento.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="mb-1.5">Origem</Label><Select value={origem} onValueChange={(valor) => setOrigem(valor as typeof origem)}><SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">As duas planilhas</SelectItem><SelectItem value="fluxo_caixa">Fluxo de Caixa</SelectItem><SelectItem value="gastos">Gastos detalhados</SelectItem></SelectContent></Select></div>
            <div><Label className="mb-1.5">Categoria</Label><Select value={categoria} onValueChange={(valor) => valor && setCategoria(valor)}><SelectTrigger className="min-w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas as categorias</SelectItem>{categorias.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="animate-spin" />Carregando dados...</div> : filtrados.length === 0 ?
            <div className="rounded-xl border border-dashed py-12 text-center"><FileSpreadsheet className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-medium">Nenhum lançamento importado</p><p className="mt-1 text-sm text-muted-foreground">Selecione uma das planilhas acima para ver a prévia.</p></div> :
            <Table><TableHeader><TableRow><TableHead>Competência</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead>Origem</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader><TableBody>{filtrados.slice(0, 100).map((item) => <TableRow key={item.id}><TableCell className="capitalize">{mesAno.format(new Date(`${item.competencia}T00:00:00Z`))}</TableCell><TableCell><p className="max-w-72 truncate font-medium">{item.descricao}</p>{item.data_lancamento && <p className="text-xs text-muted-foreground">{new Date(`${item.data_lancamento}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>}</TableCell><TableCell>{item.categoria}</TableCell><TableCell><Badge variant="outline">{item.origem === "fluxo_caixa" ? "Fluxo de Caixa" : "Gastos"}</Badge></TableCell><TableCell className={item.tipo === "entrada" ? "text-right font-semibold text-emerald-400" : "text-right font-semibold text-amber-300"}>{item.tipo === "entrada" ? "+ " : "− "}{moeda.format(Number(item.valor))}</TableCell></TableRow>)}</TableBody></Table>}
        </CardContent>
      </Card>

      {importacoes.length > 0 && <Card><CardHeader><CardTitle>Histórico de importações</CardTitle></CardHeader><CardContent className="space-y-3">{importacoes.map((item) => <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{item.arquivo_nome}</p><p className="text-xs text-muted-foreground">{dataHora.format(new Date(item.created_at))} · {item.tipo === "fluxo_caixa" ? "Fluxo de Caixa" : "Gastos"}</p></div><div className="flex gap-2 text-xs"><Badge variant="secondary">{item.linhas_novas} novos</Badge><Badge variant="outline">{item.linhas_atualizadas} atualizados</Badge></div></div>)}</CardContent></Card>}
    </div>
  )
}

function ImportCard({ tipo, titulo, descricao, analisando, onChange }: { tipo: TipoPlanilha; titulo: string; descricao: string; analisando: TipoPlanilha | null; onChange: (event: React.ChangeEvent<HTMLInputElement>, tipo: TipoPlanilha) => void }) {
  const id = `arquivo-${tipo}`
  return <Card className="transition-colors hover:border-primary/30"><CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet className="size-5" /></span><div><h2 className="font-heading text-lg font-bold">Importar {titulo}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{descricao}</p></div></div><div className="mt-auto"><Input id={id} type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => onChange(event, tipo)} disabled={Boolean(analisando)} /><Button asChild variant="outline" className="w-full"><label htmlFor={id} className="cursor-pointer">{analisando === tipo ? <Loader2 className="animate-spin" /> : <Upload />}Selecionar planilha</label></Button><p className="mt-2 text-center text-xs text-muted-foreground">Excel (.xlsx ou .xlsm), até 10 MB</p></div></CardContent></Card>
}

function PreviaNumero({ label, valor }: { label: string; valor: number }) { return <div className="rounded-xl border border-border/70 bg-background/60 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-heading text-2xl font-bold">{valor.toLocaleString("pt-BR")}</p></div> }

function ResumoCompacto({ label, valor, detalhe }: { label: string; valor: string; detalhe?: string }) {
  return <div className="rounded-xl border border-border/70 bg-background/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-heading text-lg font-bold">{valor}</p>{detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}</div>
}

function EstadoAnaliseVazio({ texto }: { texto: string }) {
  return <div className="rounded-xl border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">{texto}</div>
}
