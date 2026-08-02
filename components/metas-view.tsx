"use client"

import { useEffect, useState } from "react"
import { Pencil, Plus, Target, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { GoalProgress, type Meta } from "@/components/goal-progress"
import { createClient } from "@/lib/supabase/client"
import { useTable } from "@/lib/use-data"

const vazio = { titulo: "", descricao: "", valor_atual: "0", valor_meta: "", unidade: "R$", data_inicio: "", prazo: "", status: "em_andamento", destaque: "laranja", exibir_dashboard: true }

export function MetasView() {
  const supabase = createClient()
  const { data: metas, error, isLoading, mutate } = useTable<Meta>("metas", { column: "created_at", ascending: false })
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<Meta | null>(null)
  const [form, setForm] = useState(vazio)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (error) toast.error("Não foi possível carregar as metas. Aplique primeiro o SQL de Metas no Supabase.") }, [error])

  function abrir(meta?: Meta) {
    setEditando(meta ?? null)
    setForm(meta ? { titulo: meta.titulo, descricao: meta.descricao ?? "", valor_atual: String(meta.valor_atual), valor_meta: String(meta.valor_meta), unidade: meta.unidade, data_inicio: meta.data_inicio ?? "", prazo: meta.prazo ?? "", status: meta.status, destaque: meta.destaque, exibir_dashboard: meta.exibir_dashboard } : vazio)
    setAberto(true)
  }

  async function salvar() {
    const atual = Number(String(form.valor_atual).replace(",", "."))
    const alvo = Number(String(form.valor_meta).replace(",", "."))
    if (form.titulo.trim().length < 2 || !Number.isFinite(alvo) || alvo <= 0 || !Number.isFinite(atual) || atual < 0 || !form.unidade.trim()) return toast.error("Informe título, unidade, meta maior que zero e valor atual válido.")
    if (form.data_inicio && form.prazo && form.prazo < form.data_inicio) return toast.error("O prazo não pode ser anterior à data de início.")
    setSalvando(true)
    const payload = { titulo: form.titulo.trim(), descricao: form.descricao.trim() || null, valor_atual: atual, valor_meta: alvo, unidade: form.unidade.trim(), data_inicio: form.data_inicio || null, prazo: form.prazo || null, status: form.status, destaque: form.destaque, exibir_dashboard: form.exibir_dashboard }
    const resultado = editando ? await supabase.from("metas").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editando.id) : await supabase.from("metas").insert(payload)
    setSalvando(false)
    if (resultado.error) return toast.error(`Erro ao salvar: ${resultado.error.message}`)
    await mutate(); setAberto(false); toast.success(editando ? "Meta atualizada." : "Meta criada.")
  }

  async function excluir(meta: Meta) {
    if (!window.confirm(`Excluir a meta “${meta.titulo}”? Esta ação não poderá ser desfeita.`)) return
    const { error: deleteError } = await supabase.from("metas").delete().eq("id", meta.id)
    if (deleteError) return toast.error(`Erro ao excluir: ${deleteError.message}`)
    await mutate(); toast.success("Meta excluída.")
  }

  return (
    <div>
      <PageHeader title="Metas" description="Defina objetivos, acompanhe o progresso e escolha quais metas aparecem para toda a equipe no dashboard." action={<Button onClick={() => abrir()}><Plus className="size-4" />Nova meta</Button>} />
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando metas...</p> : metas.length === 0 ? (
        <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center"><div><Target className="mx-auto size-10 text-primary" /><h2 className="mt-4 font-heading text-xl font-bold">Nenhuma meta definida</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Crie a primeira meta para que a equipe acompanhe seu avanço no dashboard inicial.</p><Button className="mt-5" onClick={() => abrir()}><Plus className="size-4" />Criar primeira meta</Button></div></div>
      ) : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{metas.map((meta) => <div key={meta.id} className="relative"><GoalProgress meta={meta} onClick={() => abrir(meta)} /><div className="absolute bottom-3 right-3 flex gap-1"><Button size="icon-sm" variant="ghost" onClick={() => abrir(meta)} aria-label={`Editar ${meta.titulo}`}><Pencil className="size-4" /></Button><Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => excluir(meta)} aria-label={`Excluir ${meta.titulo}`}><Trash2 className="size-4" /></Button></div></div>)}</div>}

      <Dialog open={aberto} onOpenChange={setAberto}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editando ? "Editar meta" : "Nova meta"}</DialogTitle><DialogDescription>Os valores podem representar faturamento, unidades, percentual ou outro indicador.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="meta-titulo">Título</Label><Input id="meta-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Faturamento mensal" maxLength={120} /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="meta-descricao">Descrição e critérios</Label><Textarea id="meta-descricao" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Explique como o resultado será medido..." rows={3} /></div>
          <div className="space-y-2"><Label htmlFor="meta-atual">Valor atual</Label><Input id="meta-atual" inputMode="decimal" value={form.valor_atual} onChange={(e) => setForm({ ...form, valor_atual: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="meta-alvo">Valor da meta</Label><Input id="meta-alvo" inputMode="decimal" value={form.valor_meta} onChange={(e) => setForm({ ...form, valor_meta: e.target.value })} placeholder="Ex.: 50000" /></div>
          <div className="space-y-2"><Label htmlFor="meta-unidade">Unidade</Label><Input id="meta-unidade" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="R$, unidades, %, clientes..." maxLength={20} /></div>
          <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value ?? "em_andamento" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="planejada">Planejada</SelectItem><SelectItem value="em_andamento">Em andamento</SelectItem><SelectItem value="concluida">Concluída</SelectItem><SelectItem value="pausada">Pausada</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="meta-inicio">Início</Label><Input id="meta-inicio" type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="meta-prazo">Prazo</Label><Input id="meta-prazo" type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} /></div>
          <div className="space-y-2"><Label>Cor de destaque</Label><Select value={form.destaque} onValueChange={(value) => setForm({ ...form, destaque: value ?? "laranja" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="laranja">Laranja</SelectItem><SelectItem value="azul">Azul</SelectItem><SelectItem value="verde">Verde</SelectItem><SelectItem value="violeta">Violeta</SelectItem></SelectContent></Select></div>
          <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3"><div><Label htmlFor="meta-dashboard">Exibir no dashboard</Label><p className="text-xs text-muted-foreground">Somente leitura para toda a equipe.</p></div><Switch id="meta-dashboard" checked={form.exibir_dashboard} onCheckedChange={(checked) => setForm({ ...form, exibir_dashboard: checked })} /></div>
        </div><DialogFooter><Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar meta"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  )
}
