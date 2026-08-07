"use client"

import { useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  FileUp,
  ImageIcon,
  Loader2,
  Plus,
  ReceiptText,
  Sparkles,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import type { Fornecedor } from "@/lib/types"

type Insumo = { id: string; nome: string; unidade: string; ativo: boolean }

type ArquivoNota = {
  id: string
  nome: string
  path: string
  mime: string
  previewUrl?: string
}

type ItemLido = {
  id: string
  descricao: string
  descricao_normalizada: string
  codigo: string | null
  quantidade_original: number
  unidade_original: string | null
  valor_unitario_original: number | null
  valor_total: number
  categoria: string
  insumo_id_sugerido: string | null
  confianca: number
  quantidade_estoque: number
  unidade_estoque: string
  preco_unitario_estoque: number
}

type ResultadoLeitura = {
  documento: {
    fornecedor: string | null
    cnpj: string | null
    data_emissao: string | null
    numero_documento: string | null
    valor_total: number | null
    origem_chave: string
  }
  itens: ItemLido[]
  fonte: "xml" | "visao"
}

type ItemRevisao = ItemLido & {
  insumo_id: string
  quantidade_confirmada: string
  preco_unitario_confirmado: string
  categoria_confirmada: string
}

const CATEGORIAS = [
  "Proteínas",
  "Laticínios",
  "Massas e farinhas",
  "Óleos e gorduras",
  "Bebidas",
  "Embalagens",
  "Limpeza",
  "Temperos",
  "Molhos",
  "Outros",
]

function moeda(valor: number | null | undefined) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function normalizarTexto(valor: string | null | undefined) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function hojeISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function extArquivo(file: File) {
  const original = file.name.split(".").pop()?.toLowerCase()
  if (original && /^[a-z0-9]{2,5}$/.test(original)) return original
  if (file.type === "application/pdf") return "pdf"
  if (file.type.includes("xml")) return "xml"
  if (file.type === "image/png") return "png"
  if (file.type === "image/webp") return "webp"
  return "jpg"
}

export function MercadoNoteReader({
  fornecedores,
  insumos,
  onSalvo,
}: {
  fornecedores: Fornecedor[]
  insumos: Insumo[]
  onSalvo: () => void
}) {
  const supabase = createClient()
  const cameraRef = useRef<HTMLInputElement>(null)
  const arquivosRef = useRef<HTMLInputElement>(null)
  const [arquivos, setArquivos] = useState<ArquivoNota[]>([])
  const [uploading, setUploading] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoLeitura | null>(null)
  const [itens, setItens] = useState<ItemRevisao[]>([])
  const [localCompra, setLocalCompra] = useState("")
  const [fornecedorId, setFornecedorId] = useState("")
  const [dataCompra, setDataCompra] = useState(hojeISO)
  const [observacoes, setObservacoes] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const insumosAtivos = useMemo(() => insumos.filter((i) => i.ativo), [insumos])
  const pendentes = itens.filter((i) => !i.insumo_id).length
  const totalConfirmado = itens.reduce((soma, i) => {
    const q = Number(i.quantidade_confirmada) || 0
    const p = Number(i.preco_unitario_confirmado) || 0
    return soma + q * p
  }, 0)

  async function enviarArquivos(files: File[]) {
    if (!files.length) return
    const permitidos = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "application/xml", "text/xml", ""])
    const validos = files.filter((file) => permitidos.has(file.type) || file.name.toLowerCase().endsWith(".xml"))
    if (validos.length !== files.length) {
      toast.error("Use foto JPG/PNG/WEBP, PDF ou XML.")
      return
    }
    if (arquivos.length + validos.length > 8) {
      toast.error("Use no máximo 8 arquivos para a mesma nota.")
      return
    }
    if (validos.some((file) => file.size > 10 * 1024 * 1024)) {
      toast.error("Cada arquivo deve ter no máximo 10 MB.")
      return
    }

    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { toast.error("Sessão expirada."); return }
    setUploading(true)
    const novos: ArquivoNota[] = []
    try {
      for (const file of validos) {
        const ext = extArquivo(file)
        const path = `purchases/${auth.user.id}/${crypto.randomUUID()}.${ext}`
        const contentType = file.type || (ext === "xml" ? "application/xml" : "application/octet-stream")
        const { error } = await supabase.storage.from("erp-payment-attachments").upload(path, file, { contentType })
        if (error) throw error
        novos.push({
          id: crypto.randomUUID(),
          nome: file.name || `foto-${arquivos.length + novos.length + 1}.${ext}`,
          path,
          mime: contentType,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        })
      }
      setArquivos((prev) => [...prev, ...novos])
      setResultado(null)
      setItens([])
    } catch (error) {
      if (novos.length) await supabase.storage.from("erp-payment-attachments").remove(novos.map((a) => a.path))
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a nota.")
    } finally {
      setUploading(false)
    }
  }

  async function removerArquivo(arquivo: ArquivoNota) {
    await supabase.storage.from("erp-payment-attachments").remove([arquivo.path])
    if (arquivo.previewUrl) URL.revokeObjectURL(arquivo.previewUrl)
    setArquivos((prev) => prev.filter((a) => a.id !== arquivo.id))
    setResultado(null)
    setItens([])
  }

  async function processar() {
    if (!arquivos.length) { toast.error("Adicione a foto, PDF ou XML da nota."); return }
    setProcessando(true)
    try {
      const response = await fetch("/api/mercado/ler-nota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: arquivos.map((a) => a.path) }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || "Não foi possível ler a nota.")
      const leitura = payload as ResultadoLeitura
      setResultado(leitura)
      setLocalCompra(leitura.documento.fornecedor || "")
      setDataCompra(leitura.documento.data_emissao || hojeISO())

      const fornecedor = fornecedores.find((f) => {
        const a = normalizarTexto(f.nome)
        const b = normalizarTexto(leitura.documento.fornecedor)
        return a && b && (a.includes(b) || b.includes(a))
      })
      setFornecedorId(fornecedor?.id || "")
      setItens(leitura.itens.map((item) => ({
        ...item,
        insumo_id: item.insumo_id_sugerido || "",
        quantidade_confirmada: String(Number(item.quantidade_estoque.toFixed(4))),
        preco_unitario_confirmado: String(Number(item.preco_unitario_estoque.toFixed(4))),
        categoria_confirmada: item.categoria || "Outros",
      })))
      toast.success(`${leitura.itens.length} item(ns) identificado(s). Confira antes de registrar.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao processar a nota.")
    } finally {
      setProcessando(false)
    }
  }

  function alterarItem(id: string, campo: "insumo_id" | "quantidade_confirmada" | "preco_unitario_confirmado" | "categoria_confirmada", valor: string) {
    setItens((prev) => prev.map((item) => {
      if (item.id !== id) return item
      if (campo === "insumo_id") {
        const insumo = insumosAtivos.find((i) => i.id === valor)
        return { ...item, insumo_id: valor, unidade_estoque: insumo?.unidade || item.unidade_estoque }
      }
      return { ...item, [campo]: valor }
    }))
  }

  async function limparTudo(removerDoStorage = true) {
    if (removerDoStorage && arquivos.length) {
      await supabase.storage.from("erp-payment-attachments").remove(arquivos.map((a) => a.path))
    }
    arquivos.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setArquivos([])
    setResultado(null)
    setItens([])
    setLocalCompra("")
    setFornecedorId("")
    setDataCompra(hojeISO())
    setObservacoes("")
    setIdempotencyKey(crypto.randomUUID())
  }

  async function confirmar() {
    if (!resultado) return
    if (!dataCompra) { toast.error("Confira a data da compra."); return }
    if (!fornecedorId && !localCompra.trim()) { toast.error("Confira o mercado/fornecedor."); return }
    if (itens.some((i) => !i.insumo_id)) { toast.error("Vincule todos os itens a um insumo antes de confirmar."); return }
    if (itens.some((i) => !(Number(i.quantidade_confirmada) > 0) || Number(i.preco_unitario_confirmado) < 0)) {
      toast.error("Confira quantidades e preços dos itens.")
      return
    }

    setSalvando(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("Sessão expirada.")

      // Consolida linhas que apontam para o mesmo insumo. Isso evita duplicar o mesmo
      // insumo quando ele aparece mais de uma vez no cupom e mantém preço médio ponderado.
      const consolidados = new Map<string, { insumo_id: string; quantidade: number; total: number; descricoes: string[]; categorias: string[] }>()
      for (const item of itens) {
        const q = Number(item.quantidade_confirmada)
        const p = Number(item.preco_unitario_confirmado)
        const atual = consolidados.get(item.insumo_id) || { insumo_id: item.insumo_id, quantidade: 0, total: 0, descricoes: [], categorias: [] }
        atual.quantidade += q
        atual.total += q * p
        atual.descricoes.push(item.descricao)
        atual.categorias.push(item.categoria_confirmada)
        consolidados.set(item.insumo_id, atual)
      }

      const payloadItens = Array.from(consolidados.values()).map((item) => ({
        insumo_id: item.insumo_id,
        quantidade_comprada: Number(item.quantidade.toFixed(4)),
        preco_unitario: item.quantidade > 0 ? Number((item.total / item.quantidade).toFixed(4)) : 0,
        descricao_origem: item.descricoes.join(" | ").slice(0, 1000),
        categoria: item.categorias[0] || "Outros",
      }))

      const { error } = await supabase.rpc("registrar_compra_mercado_v2", {
        p_fornecedor_id: fornecedorId || null,
        p_data_compra: dataCompra,
        p_itens: payloadItens,
        p_observacoes: observacoes.trim() || null,
        p_nota_paths: arquivos.map((a) => a.path),
        p_local_compra: localCompra.trim() || null,
        p_idempotency_key: idempotencyKey,
      })
      if (error) throw error

      const mapeamentos = itens.map((item) => ({
        origem_chave: resultado.documento.origem_chave,
        descricao_normalizada: item.descricao_normalizada,
        descricao_exemplo: item.descricao.slice(0, 500),
        insumo_id: item.insumo_id,
        fator_quantidade: 1,
        categoria: item.categoria_confirmada,
        criado_por: auth.user.id,
        updated_at: new Date().toISOString(),
      }))
      const { error: mapError } = await supabase
        .from("mercado_produto_mapeamentos")
        .upsert(mapeamentos, { onConflict: "origem_chave,descricao_normalizada" })
      if (mapError) console.warn("Compra salva, mas o mapeamento não pôde ser atualizado", mapError)

      toast.success("Compra confirmada e entrada registrada no estoque.")
      await limparTudo(false)
      onSalvo()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a compra.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg"><ReceiptText className="size-5 text-primary" />Ler nota fiscal</CardTitle>
          <p className="text-sm text-muted-foreground">Fotografe a nota impressa. Em notas compridas, tire fotos sequenciais com uma pequena sobreposição.</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <input
            ref={cameraRef}
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void enviarArquivos([file])
              e.currentTarget.value = ""
            }}
          />
          <input
            ref={arquivosRef}
            className="sr-only"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf,application/xml,text/xml,.xml"
            onChange={(e) => {
              void enviarArquivos(Array.from(e.target.files ?? []))
              e.currentTarget.value = ""
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" size="lg" className="h-16 justify-start gap-3" onClick={() => cameraRef.current?.click()} disabled={uploading || processando}>
              <span className="grid size-9 place-items-center rounded-full bg-primary-foreground/15"><Camera className="size-5" /></span>
              <span className="text-left"><span className="block font-semibold">Tirar foto da nota</span><span className="block text-xs font-normal opacity-80">Abre a câmera traseira no celular</span></span>
            </Button>
            <Button type="button" size="lg" variant="outline" className="h-16 justify-start gap-3" onClick={() => arquivosRef.current?.click()} disabled={uploading || processando}>
              <span className="grid size-9 place-items-center rounded-full bg-muted"><FileUp className="size-5" /></span>
              <span className="text-left"><span className="block font-semibold">Galeria, PDF ou XML</span><span className="block text-xs font-normal text-muted-foreground">Também aceita várias fotos de uma vez</span></span>
            </Button>
          </div>

          {arquivos.length > 0 && (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <Label>{arquivos.length} arquivo{arquivos.length > 1 ? "s" : ""} da nota</Label>
                {arquivos.length < 8 && <Button type="button" variant="ghost" size="sm" onClick={() => cameraRef.current?.click()}><Plus className="size-4" />Outra foto</Button>}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {arquivos.map((arquivo, index) => (
                  <div key={arquivo.id} className="relative overflow-hidden rounded-xl border bg-muted/20">
                    <div className="grid h-28 place-items-center bg-muted/30">
                      {arquivo.previewUrl ? <img src={arquivo.previewUrl} alt={`Parte ${index + 1} da nota`} className="size-full object-contain" /> : arquivo.nome.toLowerCase().endsWith(".xml") ? <FileText className="size-9 text-primary" /> : <ImageIcon className="size-9 text-muted-foreground" />}
                    </div>
                    <div className="flex items-center gap-2 p-2">
                      <span className="min-w-0 flex-1 truncate text-xs">{index + 1}. {arquivo.nome}</span>
                      <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => void removerArquivo(arquivo)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={processar} disabled={!arquivos.length || uploading || processando}>
              {processando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {processando ? "Lendo nota..." : "Ler e separar itens"}
            </Button>
            {arquivos.length > 0 && !resultado && <Button type="button" variant="ghost" onClick={() => void limparTudo(true)}>Limpar</Button>}
            <span className="text-xs text-muted-foreground">Nada entra no estoque antes da sua confirmação.</span>
          </div>
        </CardContent>
      </Card>

      {resultado && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg">Conferência da nota</CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline">{resultado.fonte === "xml" ? "Lido do XML" : "Lido da foto/PDF"}</Badge>
                  {pendentes ? <Badge variant="destructive">{pendentes} sem vínculo</Badge> : <Badge className="gap-1"><CheckCircle2 className="size-3" />Tudo vinculado</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-1"><Label>Mercado / fornecedor lido</Label><Input value={localCompra} onChange={(e) => setLocalCompra(e.target.value)} /></div>
                <div className="grid gap-1">
                  <Label>Fornecedor cadastrado (opcional)</Label>
                  <Select value={fornecedorId} onValueChange={(v) => setFornecedorId(v ?? "")}>
                    <SelectTrigger><SelectValue placeholder="Não vinculado" /></SelectTrigger>
                    <SelectContent>{fornecedores.filter((f) => f.ativo).map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1"><Label>Data</Label><Input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} /></div>
                <div className="grid gap-1"><Label>Total informado na nota</Label><Input value={moeda(resultado.documento.valor_total)} readOnly /></div>
              </div>
              {(resultado.documento.cnpj || resultado.documento.numero_documento) && (
                <p className="text-xs text-muted-foreground">{resultado.documento.cnpj ? `CNPJ/CPF: ${resultado.documento.cnpj}` : ""}{resultado.documento.cnpj && resultado.documento.numero_documento ? " · " : ""}{resultado.documento.numero_documento ? `Nota: ${resultado.documento.numero_documento}` : ""}</p>
              )}

              <div className="overflow-x-auto rounded-xl border">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-64">Item reconhecido</TableHead>
                      <TableHead className="min-w-52">Vincular ao insumo</TableHead>
                      <TableHead className="w-36">Qtd. estoque</TableHead>
                      <TableHead className="w-36">Preço/un.</TableHead>
                      <TableHead className="min-w-40">Categoria</TableHead>
                      <TableHead className="w-28 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((item) => {
                      const selecionado = insumosAtivos.find((i) => i.id === item.insumo_id)
                      return (
                        <TableRow key={item.id} className={!item.insumo_id ? "bg-destructive/[0.035]" : undefined}>
                          <TableCell>
                            <p className="font-medium leading-snug">{item.descricao}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Nota: {item.quantidade_original.toLocaleString("pt-BR")} {item.unidade_original || ""} · {moeda(item.valor_total)}</p>
                            {item.insumo_id_sugerido && item.confianca > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Sugestão automática · {Math.round(item.confianca * 100)}% de confiança</p>}
                          </TableCell>
                          <TableCell>
                            <Select value={item.insumo_id} onValueChange={(v) => alterarItem(item.id, "insumo_id", v ?? "")}>
                              <SelectTrigger className={!item.insumo_id ? "border-destructive/60" : ""}><SelectValue placeholder="Escolha o insumo" /></SelectTrigger>
                              <SelectContent>{insumosAtivos.map((i) => <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5"><Input type="number" min="0" step="0.001" value={item.quantidade_confirmada} onChange={(e) => alterarItem(item.id, "quantidade_confirmada", e.target.value)} /><span className="text-xs text-muted-foreground">{selecionado?.unidade || item.unidade_estoque}</span></div>
                          </TableCell>
                          <TableCell><Input type="number" min="0" step="0.0001" value={item.preco_unitario_confirmado} onChange={(e) => alterarItem(item.id, "preco_unitario_confirmado", e.target.value)} /></TableCell>
                          <TableCell>
                            <Select value={item.categoria_confirmada} onValueChange={(v) => alterarItem(item.id, "categoria_confirmada", v ?? "Outros")}>
                              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{moeda((Number(item.quantidade_confirmada) || 0) * (Number(item.preco_unitario_confirmado) || 0))}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {pendentes > 0 && <div className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /><span>Os itens sem vínculo não serão confirmados por engano. Escolha a qual insumo do estoque cada um corresponde.</span></div>}

              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="grid gap-1"><Label>Observações (opcional)</Label><Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: compra emergencial, promoção, divergência conferida..." rows={2} /></div>
                <div className="text-right"><p className="text-xs text-muted-foreground">Total que será registrado</p><p className="text-xl font-bold tabular-nums text-primary">{moeda(totalConfirmado)}</p></div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => void limparTudo(true)} disabled={salvando}>Descartar leitura</Button>
                <Button type="button" onClick={confirmar} disabled={salvando || pendentes > 0}>
                  {salvando ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {salvando ? "Registrando..." : "Confirmar compra e estoque"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
