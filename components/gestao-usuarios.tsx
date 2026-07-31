"use client"

import useSWR from "swr"
import { useState } from "react"
import { Loader2, Plus, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { ConfirmDeleteButton } from "@/components/confirm-button"
import { ADMIN_EMAIL, PAPEL_LABEL, type Papel } from "@/lib/auth-roles"
import { formatDate } from "@/lib/format"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type UsuarioApi = {
  id: string
  email: string | null
  nome: string
  papel: Papel
  criado_em: string
}

const vazio = { nome: "", email: "", senha: "", papel: "socio" as Papel }

async function fetcher(url: string) {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) {
    const error = new Error(json.error || "Erro ao carregar usuários.") as Error & { code?: string }
    error.code = json.code
    throw error
  }
  return json.usuarios as UsuarioApi[]
}

export function GestaoUsuarios() {
  const { data, isLoading, error, mutate } = useSWR<UsuarioApi[]>("/api/usuarios", fetcher)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<typeof vazio>(vazio)
  const [saving, setSaving] = useState(false)

  function abrirNovo() {
    setForm(vazio)
    setOpen(true)
  }

  async function salvar() {
    if (!form.email.trim() || !form.senha) {
      toast.error("Informe e-mail e senha.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Erro ao criar usuário.")
      toast.success("Usuário criado.")
      setOpen(false)
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar usuário.")
    } finally {
      setSaving(false)
    }
  }

  async function excluir(id: string) {
    const res = await fetch(`/api/usuarios?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error || "Erro ao excluir.")
      return
    }
    toast.success("Usuário removido.")
    mutate()
  }

  const usuarios = data ?? []
  const servicoAdministrativoIndisponivel =
    (error as (Error & { code?: string }) | undefined)?.code === "ADMIN_SERVICE_NOT_CONFIGURED"

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Gerencie o acesso dos sócios e da equipe ao sistema."
        action={
          <Button onClick={abrirNovo} disabled={servicoAdministrativoIndisponivel}>
            <Plus className="size-4" />
            Novo usuário
          </Button>
        }
      />

      {error && (
        <Card className="p-4 mb-4 border-destructive/40">
          <p className="text-sm text-destructive">{(error as Error).message}</p>
          {servicoAdministrativoIndisponivel && (
            <p className="mt-1 text-xs text-muted-foreground">
              Solicite ao responsável pela implantação que habilite a gestão administrativa no servidor.
            </p>
          )}
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : usuarios.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                usuarios.map((u) => {
                  const ehAdminPadrao = u.email === ADMIN_EMAIL
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-semibold">{u.nome || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        {u.papel === "admin" ? (
                          <Badge className="bg-primary text-primary-foreground gap-1">
                            <ShieldCheck className="size-3" />
                            {PAPEL_LABEL[u.papel]}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{PAPEL_LABEL[u.papel]}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.criado_em ? formatDate(u.criado_em) : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end">
                          {ehAdminPadrao ? (
                            <span className="text-xs text-muted-foreground pr-2">Protegido</span>
                          ) : (
                            <ConfirmDeleteButton
                              onConfirm={() => excluir(u.id)}
                              label="Remover usuário"
                              description="O usuário perderá o acesso ao sistema. Esta ação não pode ser desfeita."
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="unome">Nome</Label>
              <Input id="unome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Henrique" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="uemail">E-mail</Label>
              <Input
                id="uemail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="henrique@salgadou.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="usenha">Senha</Label>
              <Input
                id="usenha"
                type="text"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Papel</Label>
              <Select value={form.papel} onValueChange={(v) => setForm({ ...form, papel: v as Papel })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="socio">Sócio</SelectItem>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Criar usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
