"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CalendarIcon,
  ChevronDown,
  ChevronUp,
  FileText,
  ImageIcon,
  Loader2,
  Plus,
  ShoppingCart,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { Fornecedor, MercadoCompra, MercadoCompraItem } from "@/lib/types"

type Insumo = { id: string; nome: string; unidade: string; ativo: boolean }

type ItemForm = {
  id: string
  insumo_id: string
  quantidade_comprada: string
  preco_unitario: string
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function moeda(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function novoItem(): ItemForm {
  return { id: crypto.randomUUID(), insumo_id: "", quantidade_comprada: "", preco_unitario: "" }
}

// ─── Componente de anexo (suporta PDF, JPG, JPEG, PNG) ───────────────────────
function AnexoField({
  notaPath,
  onChange,
}: {
  notaPath: string
  onChange: (path: string) => void
}) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState("")
  const [isPdf, setIsPdf] = useState(false)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!notaPath) { setPreviewUrl(""); return }
      const { data, error } = await supabase.storage
        .from("erp-payment-attachments")
        .createSignedUrl(notaPath, 3600)
      if (!ativo) return
      if (!error) {
        setPreviewUrl(data.signedUrl)
        setIsPdf(notaPath.toLowerCase().endsWith(".pdf"))
      }
    }
    carregar()
    return () => { ativo = false }
  }, [notaPath])

  async function enviar(file: File) {
    const permitidos = ["image/jpeg", "image/png", "application/pdf"]
    if (!permitidos.includes(file.type)) {
      toast.error("Use PDF, JPG ou PNG.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 10 MB.")
      return
    }
    setUploading(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("Sessão expirada")
      const ext = file.type === "application/pdf" ? "pdf" : file.name.split(".").pop()?.toLowerCase() || "jpg"
      const storagePath = `purchases/${auth.user.id}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage
        .from("erp-payment-attachments")
        .upload(storagePath, file, { contentType: file.type })
      if (error) throw error
      if (notaPath) await supabase.storage.from("erp-payment-attachments").remove([notaPath])
      onChange(storagePath)
      toast.success("Nota anexada.")
    } catch (err) {
      toast.error("Não foi possível anexar o arquivo.")
    } finally {
      setUploading(false)
    }
  }

  async function remover() {
    if (notaPath) await supabase.storage.from("erp-payment-attachments").remove([notaPath])
    setPreviewUrl("")
    onChange("")
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border p-4">
      <Label>Nota fiscal (opcional)</Label>
      {previewUrl ? (
        isPdf ? (
          <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
            <FileText className="size-8 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">PDF anexado</p>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline underline-offset-2"
              >
                Visualizar
              </a>
            </div>
          </div>
        ) : (
          <img
            src={previewUrl}
            alt="Nota fiscal"
            className="h-36 w-full rounded-lg bg-muted object-contain"
          />
        )
      ) : (
        <div className="grid h-20 place-items-center rounded-lg bg-muted/40 text-muted-foreground">
          <ImageIcon className="size-6" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <label className="cursor-pointer">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {previewUrl ? "Substituir" : "Selecionar arquivo"}
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) enviar(f)
                e.currentTarget.value = ""
              }}
            />
          </label>
        </Button>
        {previewUrl && (
          <Button type="button" variant="ghost" size="sm" onClick={remover}>
            <Trash2 className="size-4" />
            Remover
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">PDF, JPG ou PNG · máximo 10 MB · não público</p>
    </div>
  )
}

// ─── Aba: Nova Compra ─────────────────────────────────────────────────────────
function NovaCompra({
  fornecedores,
  insumos,
  onSalvo,
}: {
  fornecedores: Fornecedor[]
  insumos: Insumo[]
  onSalvo: () => void
}) {
  const supabase = createClient()
  const [salvando, setSalvando] = useState(false)
  const [fornecedorId, setFornecedorId] = useState("")
  const [dataCompra, setDataCompra] = useState(() => new Date().toISOString().slice(0, 10))
  const [observacoes, setObservacoes] = useState("")
  const [notaPath, setNotaPath] = useState("")
  const [itens, setItens] = useState<ItemForm[]>([novoItem()])

  function addItem() { setItens((prev) => [...prev, novoItem()]) }
  function removeItem(id: string) { setItens((prev) => prev.filter((i) => i.id !== id)) }
  function updateItem(id: string, field: keyof ItemForm, value: string) {
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)))
  }

  function calcTotal() {
    return itens.reduce((acc, i) => {
      const q = parseFloat(i.quantidade_comprada) || 0
      const p = parseFloat(i.preco_unitario) || 0
      return acc + q * p
    }, 0)
  }

  async function salvar() {
    if (!dataCompra) { toast.error("Informe a data da compra."); return }
    const itensValidos = itens.filter((i) => i.insumo_id && i.quantidade_comprada && i.preco_unitario)
    if (itensValidos.length === 0) { toast.error("Adicione ao menos um item completo."); return }

    setSalvando(true)
    try {
      const { error } = await supabase.rpc("registrar_compra_mercado", {
        p_fornecedor_id: fornecedorId || null,
        p_data_compra: dataCompra,
        p_itens: itensValidos.map((i) => ({
          insumo_id: i.insumo_id,
          quantidade_comprada: parseFloat(i.quantidade_comprada),
          preco_unitario: parseFloat(i.preco_unitario),
        })),
        p_observacoes: observacoes || null,
        p_nota_path: notaPath || null,
      })
      if (error) throw error
      toast.success("Compra registrada com sucesso.")
      // Reset
      setFornecedorId("")
      setDataCompra(new Date().toISOString().slice(0, 10))
      setObservacoes("")
      setNotaPath("")
      setItens([novoItem()])
      onSalvo()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast.error(`Não foi possível registrar a compra: ${msg}`)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="grid gap-6">
      {/* Cabeçalho */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="fornecedor">Fornecedor (opcional)</Label>
          <Select value={fornecedorId} onValueChange={(v) => setFornecedorId(v ?? "")}>
            <SelectTrigger id="fornecedor">
              <SelectValue placeholder="Selecione um fornecedor" />
            </SelectTrigger>
            <SelectContent>
              {fornecedores
                .filter((f) => f.ativo)
                .map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="data-compra">
            Data da compra <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="data-compra"
              type="date"
              value={dataCompra}
              onChange={(e) => setDataCompra(e.target.value)}
            />
            <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          </div>
        </div>
        <div className="sm:col-span-2 grid gap-2">
          <Label htmlFor="obs">Observações (opcional)</Label>
          <Textarea
            id="obs"
            placeholder="Ex.: compra emergencial, mercado diferente..."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      {/* Itens */}
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Itens comprados</h3>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="size-4" />
            Adicionar item
          </Button>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead className="w-36">Quantidade</TableHead>
                <TableHead className="w-36">Preço unit. (R$)</TableHead>
                <TableHead className="w-28 text-right">Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((item) => {
                const q = parseFloat(item.quantidade_comprada) || 0
                const p = parseFloat(item.preco_unitario) || 0
                const insumoSel = insumos.find((i) => i.id === item.insumo_id)
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Select
                        value={item.insumo_id}
                        onValueChange={(v) => updateItem(item.id, "insumo_id", v ?? "")}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Selecionar insumo" />
                        </SelectTrigger>
                        <SelectContent>
                          {insumos
                            .filter((i) => i.ativo)
                            .map((i) => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.nome}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-8 w-24"
                          type="number"
                          min="0"
                          step="0.001"
                          placeholder="0"
                          value={item.quantidade_comprada}
                          onChange={(e) => updateItem(item.id, "quantidade_comprada", e.target.value)}
                        />
                        {insumoSel && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {insumoSel.unidade}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 w-28"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={item.preco_unitario}
                        onChange={(e) => updateItem(item.id, "preco_unitario", e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {moeda(q * p)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(item.id)}
                        disabled={itens.length === 1}
                        aria-label="Remover item"
                      >
                        <X className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow>
                <TableCell colSpan={3} className="text-right font-semibold text-sm">
                  Total da compra
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums text-primary">
                  {moeda(calcTotal())}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Nota fiscal */}
      <AnexoField notaPath={notaPath} onChange={setNotaPath} />

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando} className="min-w-36">
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
          {salvando ? "Registrando..." : "Registrar compra"}
        </Button>
      </div>
    </div>
  )
}

// ─── Linha expandível do histórico ───────────────────────────────────────────
function LinhaHistorico({ compra, insumos }: { compra: MercadoCompra; insumos: Insumo[] }) {
  const supabase = createClient()
  const [expandido, setExpandido] = useState(false)
  const [notaUrl, setNotaUrl] = useState("")

  async function verNota() {
    if (!compra.nota_path || notaUrl) return
    const { data } = await supabase.storage
      .from("erp-payment-attachments")
      .createSignedUrl(compra.nota_path, 3600)
    if (data) setNotaUrl(data.signedUrl)
  }

  const dataFormatada = new Date(compra.data_compra + "T12:00:00").toLocaleDateString("pt-BR")

  return (
    <>
      <TableRow
        className="cursor-pointer select-none"
        onClick={() => { setExpandido((v) => !v); verNota() }}
      >
        <TableCell className="font-medium">{dataFormatada}</TableCell>
        <TableCell>{compra.fornecedor?.nome ?? <span className="text-muted-foreground">—</span>}</TableCell>
        <TableCell className="text-center">
          <Badge variant="secondary">{compra.itens?.length ?? 0} iten{(compra.itens?.length ?? 0) !== 1 ? "s" : ""}</Badge>
        </TableCell>
        <TableCell className="text-right font-semibold tabular-nums">{moeda(compra.valor_total)}</TableCell>
        <TableCell className="text-center">
          {compra.nota_path ? (
            <Badge variant="outline" className="text-xs">
              <FileText className="size-3 mr-1" />
              Nota
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {expandido ? <ChevronUp className="size-4 inline" /> : <ChevronDown className="size-4 inline" />}
        </TableCell>
      </TableRow>
      {expandido && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/20 py-4 px-6">
            <div className="grid gap-3">
              {compra.observacoes && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Obs:</span> {compra.observacoes}
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="w-32 text-right">Qtd.</TableHead>
                    <TableHead className="w-32 text-right">Preço unit.</TableHead>
                    <TableHead className="w-32 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(compra.itens ?? []).map((item) => {
                    const ins = insumos.find((i) => i.id === item.insumo_id)
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{ins?.nome ?? item.insumo_id}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.quantidade_comprada} {ins?.unidade ?? ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {moeda(item.preco_unitario)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {moeda(item.preco_total)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {notaUrl && (
                <a
                  href={notaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
                >
                  <FileText className="size-4" />
                  Ver nota fiscal
                </a>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

// ─── Aba: Histórico ───────────────────────────────────────────────────────────
function Historico({ compras, insumos }: { compras: MercadoCompra[]; insumos: Insumo[] }) {
  const agora = new Date()
  const [mesSel, setMesSel] = useState(agora.getMonth())
  const [anoSel, setAnoSel] = useState(agora.getFullYear())

  const anos = useMemo(() => {
    const set = new Set<number>()
    compras.forEach((c) => set.add(new Date(c.data_compra + "T12:00:00").getFullYear()))
    set.add(agora.getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [compras])

  const filtradas = useMemo(
    () =>
      compras.filter((c) => {
        const d = new Date(c.data_compra + "T12:00:00")
        return d.getMonth() === mesSel && d.getFullYear() === anoSel
      }),
    [compras, mesSel, anoSel],
  )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={String(mesSel)} onValueChange={(v) => setMesSel(Number(v))}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={i} value={String(i)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(anoSel)} onValueChange={(v) => setAnoSel(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anos.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filtradas.length} compra{filtradas.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtradas.length === 0 ? (
        <div className="grid h-40 place-items-center rounded-xl border border-dashed border-border text-muted-foreground text-sm">
          Nenhuma compra registrada neste período.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-center">Itens</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center">Nota</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((c) => (
                <LinhaHistorico key={c.id} compra={c} insumos={insumos} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─── Aba: Resumo Mensal ───────────────────────────────────────────────────────
function ResumoMensal({ compras, insumos }: { compras: MercadoCompra[]; insumos: Insumo[] }) {
  const agora = new Date()
  const [mesSel, setMesSel] = useState(agora.getMonth())
  const [anoSel, setAnoSel] = useState(agora.getFullYear())

  const anos = useMemo(() => {
    const set = new Set<number>()
    compras.forEach((c) => set.add(new Date(c.data_compra + "T12:00:00").getFullYear()))
    set.add(agora.getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [compras])

  const filtradas = useMemo(
    () =>
      compras.filter((c) => {
        const d = new Date(c.data_compra + "T12:00:00")
        return d.getMonth() === mesSel && d.getFullYear() === anoSel
      }),
    [compras, mesSel, anoSel],
  )

  const totalGasto = filtradas.reduce((acc, c) => acc + c.valor_total, 0)
  const mediaPorCompra = filtradas.length > 0 ? totalGasto / filtradas.length : 0

  // Agrega itens por insumo — todos os meses para calcular preço anterior
  type AggItem = {
    insumo_id: string
    nome: string
    unidade: string
    qtd_total: number
    valor_total: number
    ultimo_preco: number
    preco_anterior: number | null
    ultima_data: string
  }

  const porInsumo = useMemo<AggItem[]>(() => {
    // histórico de preços por insumo (todas as compras, ordenado por data)
    const histPreco: Record<string, { preco: number; data: string }[]> = {}
    compras.forEach((c) => {
      ;(c.itens ?? []).forEach((item) => {
        if (!histPreco[item.insumo_id]) histPreco[item.insumo_id] = []
        histPreco[item.insumo_id].push({ preco: item.preco_unitario, data: c.data_compra })
      })
    })
    Object.values(histPreco).forEach((arr) => arr.sort((a, b) => a.data.localeCompare(b.data)))

    const mapa: Record<string, { qtd: number; valor: number }> = {}
    filtradas.forEach((c) => {
      ;(c.itens ?? []).forEach((item) => {
        if (!mapa[item.insumo_id]) mapa[item.insumo_id] = { qtd: 0, valor: 0 }
        mapa[item.insumo_id].qtd += item.quantidade_comprada
        mapa[item.insumo_id].valor += item.preco_total
      })
    })

    return Object.entries(mapa)
      .map(([insumo_id, { qtd, valor }]) => {
        const ins = insumos.find((i) => i.id === insumo_id)
        const hist = histPreco[insumo_id] ?? []
        const ultIdx = hist.length - 1
        const ultimo_preco = hist[ultIdx]?.preco ?? 0
        const preco_anterior = ultIdx > 0 ? hist[ultIdx - 1].preco : null
        return {
          insumo_id,
          nome: ins?.nome ?? insumo_id,
          unidade: ins?.unidade ?? "",
          qtd_total: qtd,
          valor_total: valor,
          ultimo_preco,
          preco_anterior,
          ultima_data: hist[ultIdx]?.data ?? "",
        }
      })
      .sort((a, b) => b.valor_total - a.valor_total)
  }, [filtradas, compras, insumos])

  return (
    <div className="grid gap-6">
      {/* Filtro */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={String(mesSel)} onValueChange={(v) => setMesSel(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(anoSel)} onValueChange={(v) => setAnoSel(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total gasto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{moeda(totalGasto)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Qtd. de compras</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{filtradas.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Média por compra</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{moeda(mediaPorCompra)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela por insumo */}
      {porInsumo.length === 0 ? (
        <div className="grid h-32 place-items-center rounded-xl border border-dashed border-border text-muted-foreground text-sm">
          Nenhuma compra neste período.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead className="text-right">Qtd. comprada</TableHead>
                <TableHead className="text-right">Valor gasto</TableHead>
                <TableHead className="text-right">Último preço</TableHead>
                <TableHead className="text-right">Preço anterior</TableHead>
                <TableHead className="text-right">Variação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porInsumo.map((row) => {
                const variacao =
                  row.preco_anterior && row.preco_anterior > 0
                    ? ((row.ultimo_preco - row.preco_anterior) / row.preco_anterior) * 100
                    : null
                return (
                  <TableRow key={row.insumo_id}>
                    <TableCell className="font-medium">{row.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.qtd_total.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {row.unidade}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {moeda(row.valor_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{moeda(row.ultimo_preco)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.preco_anterior != null ? moeda(row.preco_anterior) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {variacao == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 text-sm font-semibold ${
                            variacao > 0 ? "text-destructive" : variacao < 0 ? "text-emerald-500" : "text-muted-foreground"
                          }`}
                        >
                          {variacao > 0 ? (
                            <TrendingUp className="size-3.5" />
                          ) : variacao < 0 ? (
                            <TrendingDown className="size-3.5" />
                          ) : null}
                          {variacao > 0 ? "+" : ""}
                          {variacao.toFixed(1)}%
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function MercadoView() {
  const supabase = createClient()

  const { data: fornecedores } = useSWR<Fornecedor[]>("fornecedores:mercado", async () => {
    const { data, error } = await supabase.from("fornecedores").select("*").order("nome")
    if (error) throw error
    return (data ?? []) as Fornecedor[]
  })

  const { data: insumos } = useSWR<Insumo[]>("producao_insumos:mercado", async () => {
    const { data, error } = await supabase
      .from("producao_insumos")
      .select("id, nome, unidade, ativo")
      .eq("ativo", true)
      .order("nome")
    if (error) throw error
    return (data ?? []) as Insumo[]
  })

  const {
    data: compras,
    mutate: mutateCompras,
    isLoading,
  } = useSWR<MercadoCompra[]>("mercado_compras", async () => {
    const { data, error } = await supabase
      .from("mercado_compras")
      .select(`
        *,
        fornecedor:fornecedor_id ( nome ),
        itens:mercado_compra_itens (
          id, compra_id, insumo_id,
          quantidade_comprada, preco_unitario, preco_total
        )
      `)
      .order("data_compra", { ascending: false })
    if (error) throw error
    return (data ?? []) as MercadoCompra[]
  })

  const onSalvo = useCallback(() => mutateCompras(), [mutateCompras])

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">Mercado</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registre compras realizadas, acompanhe o histórico e analise os preços por insumo.
        </p>
      </div>

      <Tabs defaultValue="nova-compra">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="nova-compra">Nova compra</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="resumo">Resumo mensal</TabsTrigger>
        </TabsList>

        <Separator className="my-4" />

        <TabsContent value="nova-compra">
          {isLoading ? (
            <div className="grid h-40 place-items-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <NovaCompra
              fornecedores={fornecedores ?? []}
              insumos={insumos ?? []}
              onSalvo={onSalvo}
            />
          )}
        </TabsContent>

        <TabsContent value="historico">
          {isLoading ? (
            <div className="grid h-40 place-items-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Historico compras={compras ?? []} insumos={insumos ?? []} />
          )}
        </TabsContent>

        <TabsContent value="resumo">
          {isLoading ? (
            <div className="grid h-40 place-items-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ResumoMensal compras={compras ?? []} insumos={insumos ?? []} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
