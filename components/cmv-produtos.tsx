"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Calculator, Loader2, Pencil, Save, Search } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { formatBRL } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type Ficha = {
  id: string
  nome: string
  categoria: string
  unidade_rendimento: string
  rendimento_padrao: number
  revisao_pendente: boolean
}

type CustoFicha = {
  ficha_id: string
  custo_receita: number
  custo_por_unidade_rendimento: number
}

type ConfiguracaoCMV = {
  id: string
  ficha_id: string
  quantidade_venda: number
  preco_venda: number
  custo_embalagem: number
  outros_custos_diretos: number
  taxa_venda_percentual: number
  observacoes: string | null
}

type FormCMV = {
  quantidade_venda: string
  preco_venda: string
  custo_embalagem: string
  outros_custos_diretos: string
  taxa_venda_percentual: string
  observacoes: string
}

const formVazio: FormCMV = {
  quantidade_venda: "1",
  preco_venda: "",
  custo_embalagem: "",
  outros_custos_diretos: "",
  taxa_venda_percentual: "",
  observacoes: "",
}

function numero(valor: string) {
  const convertido = Number(valor.replace(",", "."))
  return Number.isFinite(convertido) ? convertido : 0
}

export function CmvProdutos() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [custos, setCustos] = useState<CustoFicha[]>([])
  const [configuracoes, setConfiguracoes] = useState<ConfiguracaoCMV[]>([])
  const [busca, setBusca] = useState("")
  const [fichaSelecionada, setFichaSelecionada] = useState<Ficha | null>(null)
  const [form, setForm] = useState<FormCMV>(formVazio)

  async function carregar() {
    setLoading(true)
    const [fichasResult, custosResult, cmvResult] = await Promise.all([
      supabase
        .from("producao_fichas_tecnicas")
        .select("id,nome,categoria,unidade_rendimento,rendimento_padrao,revisao_pendente")
        .eq("ativo", true)
        .eq("categoria", "salgado")
        .order("nome"),
      supabase
        .from("producao_custos_fichas")
        .select("ficha_id,custo_receita,custo_por_unidade_rendimento"),
      supabase.from("cmv_produtos").select("*").order("updated_at", { ascending: false }),
    ])

    const erro = fichasResult.error || custosResult.error || cmvResult.error
    if (erro) toast.error("Não foi possível carregar os dados de CMV.")
    setFichas((fichasResult.data ?? []) as Ficha[])
    setCustos((custosResult.data ?? []) as CustoFicha[])
    setConfiguracoes((cmvResult.data ?? []) as ConfiguracaoCMV[])
    setLoading(false)
  }

  useEffect(() => {
    void carregar()
  }, [])

  const linhas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR")
    return fichas
      .filter((ficha) => !termo || ficha.nome.toLocaleLowerCase("pt-BR").includes(termo))
      .map((ficha) => {
        const custo = custos.find((item) => item.ficha_id === ficha.id)
        const configuracao = configuracoes.find((item) => item.ficha_id === ficha.id)
        const quantidade = Number(configuracao?.quantidade_venda ?? 1)
        const custoIngredientes = Number(custo?.custo_por_unidade_rendimento ?? 0) * quantidade
        const embalagem = Number(configuracao?.custo_embalagem ?? 0)
        const outros = Number(configuracao?.outros_custos_diretos ?? 0)
        const preco = Number(configuracao?.preco_venda ?? 0)
        const taxaPercentual = Number(configuracao?.taxa_venda_percentual ?? 0)
        const cmv = custoIngredientes + embalagem + outros
        const taxa = preco * taxaPercentual / 100
        const margemBruta = preco - cmv
        const resultadoAposTaxa = margemBruta - taxa
        return {
          ficha,
          configuracao,
          custoUnitario: Number(custo?.custo_por_unidade_rendimento ?? 0),
          custoIngredientes,
          cmv,
          preco,
          cmvPercentual: preco > 0 ? cmv / preco * 100 : 0,
          margemBruta,
          margemPercentual: preco > 0 ? margemBruta / preco * 100 : 0,
          taxa,
          resultadoAposTaxa,
        }
      })
  }, [busca, configuracoes, custos, fichas])

  const configurados = linhas.filter((linha) => Boolean(linha.configuracao)).length
  const semCusto = linhas.filter((linha) => linha.custoUnitario <= 0).length
  const cmvMedio = (() => {
    const validos = linhas.filter((linha) => linha.preco > 0)
    return validos.length ? validos.reduce((total, linha) => total + linha.cmvPercentual, 0) / validos.length : 0
  })()

  function abrirEdicao(ficha: Ficha) {
    const atual = configuracoes.find((item) => item.ficha_id === ficha.id)
    setFichaSelecionada(ficha)
    setForm(
      atual
        ? {
            quantidade_venda: String(atual.quantidade_venda),
            preco_venda: String(atual.preco_venda),
            custo_embalagem: String(atual.custo_embalagem),
            outros_custos_diretos: String(atual.outros_custos_diretos),
            taxa_venda_percentual: String(atual.taxa_venda_percentual),
            observacoes: atual.observacoes ?? "",
          }
        : formVazio,
    )
  }

  async function salvar() {
    if (!fichaSelecionada) return
    const quantidade = numero(form.quantidade_venda)
    const preco = numero(form.preco_venda)
    const embalagem = numero(form.custo_embalagem)
    const outros = numero(form.outros_custos_diretos)
    const taxa = numero(form.taxa_venda_percentual)

    if (quantidade <= 0) return toast.error("Informe uma quantidade de venda maior que zero.")
    if ([preco, embalagem, outros, taxa].some((valor) => valor < 0) || taxa > 100) {
      return toast.error("Confira os valores informados.")
    }

    setSaving(true)
    const { error } = await supabase.from("cmv_produtos").upsert(
      {
        ficha_id: fichaSelecionada.id,
        quantidade_venda: quantidade,
        preco_venda: preco,
        custo_embalagem: embalagem,
        outros_custos_diretos: outros,
        taxa_venda_percentual: taxa,
        observacoes: form.observacoes.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ficha_id" },
    )
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success("CMV do produto atualizado.")
    setFichaSelecionada(null)
    await carregar()
  }

  if (loading) {
    return <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando CMV...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="CMV por Produto"
        description="Calcule o custo direto, o percentual de CMV e a margem de cada item vendido a partir das fichas técnicas."
      />

      <Card className="border-primary/20 bg-primary/[0.035]">
        <CardContent className="grid gap-3 p-5 text-sm md:grid-cols-2">
          <div>
            <p className="font-semibold">O que entra no CMV</p>
            <p className="mt-1 text-muted-foreground">Ingredientes e preparações em cadeia, embalagem e outros custos diretos do produto.</p>
          </div>
          <div>
            <p className="font-semibold">O que fica separado</p>
            <p className="mt-1 text-muted-foreground">A taxa do canal de venda é descontada depois da margem bruta para não distorcer o custo do produto.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Resumo label="Produtos configurados" valor={`${configurados}/${linhas.length}`} />
        <Resumo label="CMV médio" valor={`${cmvMedio.toFixed(1).replace(".", ",")}%`} />
        <Resumo label="Sem custo calculado" valor={String(semCusto)} alerta={semCusto > 0} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar produto" className="pl-9" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Custo unitário</TableHead>
                <TableHead className="text-right">CMV</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">CMV %</TableHead>
                <TableHead className="text-right">Margem bruta</TableHead>
                <TableHead className="text-right">Após taxa</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="h-28 text-center text-muted-foreground">Nenhum produto encontrado.</TableCell></TableRow>
              ) : linhas.map((linha) => (
                <TableRow key={linha.ficha.id}>
                  <TableCell>
                    <p className="font-semibold">{linha.ficha.nome}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {!linha.configuracao && <Badge variant="outline">Não configurado</Badge>}
                      {linha.ficha.revisao_pendente && <Badge variant="destructive">Ficha em revisão</Badge>}
                      {linha.custoUnitario <= 0 && <Badge variant="secondary">Custo zerado</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{Number(linha.configuracao?.quantidade_venda ?? 1).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">{formatBRL(linha.custoUnitario)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatBRL(linha.cmv)}</TableCell>
                  <TableCell className="text-right">{formatBRL(linha.preco)}</TableCell>
                  <TableCell className="text-right"><Badge variant={linha.cmvPercentual > 40 ? "destructive" : "secondary"}>{linha.cmvPercentual.toFixed(1).replace(".", ",")}%</Badge></TableCell>
                  <TableCell className="text-right">{formatBRL(linha.margemBruta)}<span className="block text-xs text-muted-foreground">{linha.margemPercentual.toFixed(1).replace(".", ",")}%</span></TableCell>
                  <TableCell className="text-right font-semibold">{formatBRL(linha.resultadoAposTaxa)}{linha.taxa > 0 && <span className="block text-xs text-muted-foreground">taxa {formatBRL(linha.taxa)}</span>}</TableCell>
                  <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => abrirEdicao(linha.ficha)}><Pencil className="size-4" />Configurar</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={Boolean(fichaSelecionada)} onOpenChange={(aberto) => !aberto && setFichaSelecionada(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calculator className="size-5 text-primary" />CMV de {fichaSelecionada?.nome}</DialogTitle>
            <DialogDescription>Configure a forma como o produto é vendido. O custo dos ingredientes vem automaticamente da ficha técnica.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Quantidade vendida" value={form.quantidade_venda} onChange={(valor) => setForm({ ...form, quantidade_venda: valor })} />
            <Campo label="Preço de venda (R$)" value={form.preco_venda} onChange={(valor) => setForm({ ...form, preco_venda: valor })} />
            <Campo label="Custo de embalagem (R$)" value={form.custo_embalagem} onChange={(valor) => setForm({ ...form, custo_embalagem: valor })} />
            <Campo label="Outros custos diretos (R$)" value={form.outros_custos_diretos} onChange={(valor) => setForm({ ...form, outros_custos_diretos: valor })} />
            <div className="sm:col-span-2"><Campo label="Taxa do canal de venda (%)" value={form.taxa_venda_percentual} onChange={(valor) => setForm({ ...form, taxa_venda_percentual: valor })} /></div>
            <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} placeholder="Ex.: caixa com 25 unidades, venda no iFood ou balcão" /></div>
          </div>
          <DialogFooter><Button onClick={salvar} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save className="size-4" />}Salvar CMV</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (valor: string) => void }) {
  return <div><Label>{label}</Label><Input type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} /></div>
}

function Resumo({ label, valor, alerta = false }: { label: string; valor: string; alerta?: boolean }) {
  return <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 font-heading text-2xl font-bold">{valor}</p></div>{alerta ? <AlertTriangle className="size-6 text-amber-500" /> : <Calculator className="size-6 text-primary" />}</CardContent></Card>
}
