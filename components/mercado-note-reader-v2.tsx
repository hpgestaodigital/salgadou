"use client"

import { useRef, useState } from "react"
import { Camera, CheckCircle2, FileUp, Loader2, Plus, ReceiptText, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { PaymentMethodSelector, type PaymentSelection } from "@/components/payment-method-selector"
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
type Arquivo = { id: string; nome: string; path: string }
type Item = {
  id: string; descricao: string; descricao_normalizada: string; valor_total: number; categoria: string;
  insumo_id_sugerido: string | null; quantidade_estoque: number; preco_unitario_estoque: number;
  insumo_id: string; quantidade: string; preco: string; categoria_confirmada: string
}
type Leitura = {
  documento: { fornecedor: string | null; data_emissao: string | null; valor_total: number | null; origem_chave: string; cnpj: string | null; numero_documento: string | null }
  itens: Array<Omit<Item, "insumo_id" | "quantidade" | "preco" | "categoria_confirmada">>
  fonte: "xml" | "visao"
}
type PagDetectado = { tipo: PaymentSelection["tipo"] | null; detalhe: string | null; confianca: number }

function hojeISO() { return new Date().toISOString().slice(0, 10) }
function moeda(v: number | null | undefined) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }

export function MercadoNoteReaderV2({ fornecedores, insumos, onSalvo }: { fornecedores: Fornecedor[]; insumos: Insumo[]; onSalvo: () => void }) {
  const supabase = createClient()
  const cameraRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<HTMLInputElement>(null)
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [uploading, setUploading] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [pagDetectado, setPagDetectado] = useState<PagDetectado | null>(null)
  const [pagamento, setPagamento] = useState<PaymentSelection>({ tipo: "", contaId: "", cartaoId: "", detalheLido: "" })
  const [itens, setItens] = useState<Item[]>([])
  const [fornecedorId, setFornecedorId] = useState("")
  const [localCompra, setLocalCompra] = useState("")
  const [dataCompra, setDataCompra] = useState(hojeISO())
  const [observacoes, setObservacoes] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  async function enviar(files: File[]) {
    if (!files.length) return
    if (arquivos.length + files.length > 8) return toast.error("Use no máximo 8 arquivos por nota.")
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return toast.error("Sessão expirada.")
    setUploading(true)
    const novos: Arquivo[] = []
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) throw new Error("Cada arquivo deve ter no máximo 10 MB.")
        const ext = file.name.split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "jpg")
        const path = `purchases/${auth.user.id}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from("erp-payment-attachments").upload(path, file, { contentType: file.type || undefined })
        if (error) throw error
        novos.push({ id: crypto.randomUUID(), nome: file.name || `nota.${ext}`, path })
      }
      setArquivos((a) => [...a, ...novos]); setLeitura(null); setItens([]); setPagamento({ tipo: "", contaId: "", cartaoId: "", detalheLido: "" })
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha no upload.") } finally { setUploading(false) }
  }

  async function processar() {
    if (!arquivos.length) return toast.error("Adicione a nota.")
    setProcessando(true)
    try {
      const body = JSON.stringify({ paths: arquivos.map((a) => a.path) })
      const [resLeitura, resPag] = await Promise.all([
        fetch("/api/mercado/ler-nota", { method: "POST", headers: { "Content-Type": "application/json" }, body }),
        fetch("/api/mercado/detectar-pagamento", { method: "POST", headers: { "Content-Type": "application/json" }, body }),
      ])
      const l = await resLeitura.json(); if (!resLeitura.ok) throw new Error(l?.error || "Falha ao ler a nota.")
      const p = await resPag.json().catch(() => null)
      const leituraAtual = l as Leitura
      setLeitura(leituraAtual)
      setPagDetectado(p?.pagamento ?? null)
      setLocalCompra(leituraAtual.documento.fornecedor || "")
      setDataCompra(leituraAtual.documento.data_emissao || hojeISO())
      const f = fornecedores.find((x) => leituraAtual.documento.fornecedor && x.nome.toLowerCase().includes(leituraAtual.documento.fornecedor.toLowerCase()))
      setFornecedorId(f?.id || "")
      setItens(leituraAtual.itens.map((i) => ({ ...i, insumo_id: i.insumo_id_sugerido || "", quantidade: String(Number(i.quantidade_estoque.toFixed(4))), preco: String(Number(i.preco_unitario_estoque.toFixed(4))), categoria_confirmada: i.categoria || "Outros" })))
      toast.success("Nota lida. Confira os itens e a forma de pagamento.")
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao processar.") } finally { setProcessando(false) }
  }

  async function confirmar() {
    if (!leitura) return
    if (!pagamento.tipo) return toast.error("Informe a forma de pagamento.")
    if (pagamento.tipo === "pix" && !pagamento.contaId) return toast.error("Selecione a conta do PIX.")
    if ((pagamento.tipo === "debito" || pagamento.tipo === "credito") && !pagamento.cartaoId) return toast.error("Selecione o cartão utilizado.")
    if (itens.some((i) => !i.insumo_id)) return toast.error("Vincule todos os itens ao estoque.")
    setSalvando(true)
    try {
      const consolidados = new Map<string, { q: number; total: number; desc: string[]; cat: string }>()
      for (const i of itens) {
        const q = Number(i.quantidade), p = Number(i.preco)
        if (!(q > 0) || p < 0) throw new Error("Confira quantidades e preços.")
        const a = consolidados.get(i.insumo_id) || { q: 0, total: 0, desc: [], cat: i.categoria_confirmada }
        a.q += q; a.total += q * p; a.desc.push(i.descricao); consolidados.set(i.insumo_id, a)
      }
      const payloadItens = Array.from(consolidados.entries()).map(([insumo_id, a]) => ({ insumo_id, quantidade_comprada: Number(a.q.toFixed(4)), preco_unitario: Number((a.total / a.q).toFixed(4)), descricao_origem: a.desc.join(" | ").slice(0, 1000), categoria: a.cat }))
      const { error } = await supabase.rpc("registrar_compra_mercado_v3", {
        p_fornecedor_id: fornecedorId || null, p_data_compra: dataCompra, p_itens: payloadItens, p_observacoes: observacoes || null,
        p_nota_paths: arquivos.map((a) => a.path), p_local_compra: localCompra || null, p_idempotency_key: idempotencyKey,
        p_pagamento_tipo: pagamento.tipo, p_pagamento_conta_id: pagamento.contaId || null, p_pagamento_cartao_id: pagamento.cartaoId || null,
        p_pagamento_detalhe_lido: pagDetectado?.detalhe || null,
      })
      if (error) throw error
      toast.success("Compra e forma de pagamento registradas.")
      setArquivos([]); setLeitura(null); setItens([]); setPagDetectado(null); setPagamento({ tipo: "", contaId: "", cartaoId: "", detalheLido: "" }); setObservacoes(""); setIdempotencyKey(crypto.randomUUID()); onSalvo()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível registrar.") } finally { setSalvando(false) }
  }

  return <div className="grid gap-6">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-5 text-primary" />Ler nota fiscal</CardTitle></CardHeader><CardContent className="grid gap-4">
      <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar([f]); e.currentTarget.value = "" }} />
      <input ref={filesRef} className="sr-only" type="file" multiple accept="image/*,application/pdf,application/xml,text/xml,.xml" onChange={(e) => { void enviar(Array.from(e.target.files ?? [])); e.currentTarget.value = "" }} />
      <div className="flex flex-wrap gap-2"><Button onClick={() => cameraRef.current?.click()} disabled={uploading}><Camera className="size-4" />Tirar foto</Button><Button variant="outline" onClick={() => filesRef.current?.click()} disabled={uploading}><FileUp className="size-4" />Galeria, PDF ou XML</Button>{arquivos.length < 8 && arquivos.length > 0 && <Button variant="ghost" onClick={() => cameraRef.current?.click()}><Plus className="size-4" />Outra foto</Button>}</div>
      {arquivos.map((a) => <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span className="truncate">{a.nome}</span><Button variant="ghost" size="icon" onClick={() => { void supabase.storage.from("erp-payment-attachments").remove([a.path]); setArquivos((x) => x.filter((i) => i.id !== a.id)) }}><Trash2 className="size-4" /></Button></div>)}
      <Button onClick={processar} disabled={!arquivos.length || processando}>{processando ? <Loader2 className="size-4 animate-spin" /> : <ReceiptText className="size-4" />}{processando ? "Lendo..." : "Ler nota"}</Button>
    </CardContent></Card>

    {leitura && <Card><CardHeader><div className="flex justify-between gap-2"><CardTitle>Conferência</CardTitle><Badge variant="outline">{leitura.fonte === "xml" ? "XML" : "Foto/PDF"}</Badge></div></CardHeader><CardContent className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><Label>Mercado / fornecedor</Label><Input value={localCompra} onChange={(e) => setLocalCompra(e.target.value)} /></div><div><Label>Fornecedor cadastrado</Label><Select value={fornecedorId} onValueChange={(v) => setFornecedorId(v ?? "")}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent>{fornecedores.filter((f) => f.ativo).map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent></Select></div><div><Label>Data</Label><Input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} /></div><div><Label>Total da nota</Label><Input value={moeda(leitura.documento.valor_total)} readOnly /></div></div>
      <PaymentMethodSelector value={pagamento} onChange={setPagamento} suggestedType={pagDetectado?.tipo || null} suggestedDetail={pagDetectado?.detalhe || null} confidence={pagDetectado?.confianca} />
      <div className="overflow-x-auto rounded-xl border"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Insumo</TableHead><TableHead>Qtd.</TableHead><TableHead>Preço/un.</TableHead><TableHead>Total</TableHead></TableRow></TableHeader><TableBody>{itens.map((i) => <TableRow key={i.id}><TableCell>{i.descricao}</TableCell><TableCell><Select value={i.insumo_id} onValueChange={(v) => setItens((xs) => xs.map((x) => x.id === i.id ? { ...x, insumo_id: v ?? "" } : x))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{insumos.filter((x) => x.ativo).map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Input type="number" value={i.quantidade} onChange={(e) => setItens((xs) => xs.map((x) => x.id === i.id ? { ...x, quantidade: e.target.value } : x))} /></TableCell><TableCell><Input type="number" value={i.preco} onChange={(e) => setItens((xs) => xs.map((x) => x.id === i.id ? { ...x, preco: e.target.value } : x))} /></TableCell><TableCell>{moeda(Number(i.quantidade) * Number(i.preco))}</TableCell></TableRow>)}</TableBody></Table></div>
      <div><Label>Observações</Label><Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} /></div>
      <div className="flex justify-end"><Button onClick={confirmar} disabled={salvando}>{salvando ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{salvando ? "Registrando..." : "Confirmar compra e pagamento"}</Button></div>
    </CardContent></Card>}
  </div>
}
