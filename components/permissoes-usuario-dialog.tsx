"use client"

import { useEffect, useState } from "react"
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react"
import { toast } from "sonner"
import { MODULOS, type Modulo, type Permissoes } from "@/lib/access-control"
import { PAPEL_LABEL, type Papel } from "@/lib/auth-roles"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Usuario = { id: string; nome: string; email: string | null; papel: Papel }
const MODULOS_DASHBOARD = MODULOS.filter((item) => item.key.startsWith("dashboard_"))
const MODULOS_SECOES = MODULOS.filter((item) => !item.key.startsWith("dashboard_"))

export function PermissoesUsuarioDialog({
  usuario,
  open,
  onOpenChange,
  onSaved,
}: {
  usuario: Usuario | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [papel, setPapel] = useState<Papel>("colaborador")
  const [permissoes, setPermissoes] = useState<Permissoes>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !usuario) return
    setLoading(true)
    fetch(`/api/usuarios/permissoes?usuario_id=${encodeURIComponent(usuario.id)}`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        setPapel(json.papel)
        setPermissoes(json.permissoes)
      })
      .catch((error) => toast.error(error.message || "Erro ao carregar permissões."))
      .finally(() => setLoading(false))
  }, [open, usuario])

  async function salvar() {
    if (!usuario) return
    setSaving(true)
    try {
      const res = await fetch("/api/usuarios/permissoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: usuario.id, papel, permissoes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Acessos atualizados.")
      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar acessos.")
    } finally {
      setSaving(false)
    }
  }

  function alternar(modulo: Modulo) {
    if (papel === "colaborador" && ["dashboard", "dashboard_calendario_producao", "escala", "kanban"].includes(modulo)) return
    setPermissoes((atual) => ({ ...atual, [modulo]: !atual[modulo] }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Acessos de {usuario?.nome || usuario?.email}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" /> Carregando acessos...
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-1.5">
              <Label>Categoria do usuário</Label>
              <Select value={papel} onValueChange={(value) => {
                const novoPapel = value as Papel
                setPapel(novoPapel)
                if (novoPapel === "financeiro") setPermissoes(Object.fromEntries(MODULOS.map((item) => [item.key, true])) as Permissoes)
                if (novoPapel === "colaborador") setPermissoes((atual) => ({ ...atual, dashboard: true, dashboard_calendario_producao: true, escala: true, kanban: true }))
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="socio">{PAPEL_LABEL.socio}</SelectItem>
                  <SelectItem value="financeiro">{PAPEL_LABEL.financeiro}</SelectItem>
                  <SelectItem value="juridico">{PAPEL_LABEL.juridico}</SelectItem>
                  <SelectItem value="colaborador">{PAPEL_LABEL.colaborador}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A categoria aplica o conjunto padrão. Os botões abaixo permitem personalizar este usuário.
              </p>
            </div>

            <div className="grid gap-2">
              <div>
                <h3 className="text-sm font-semibold">Conteúdo do Dashboard</h3>
                <p className="text-xs text-muted-foreground">Escolha o que este usuário verá na página inicial. “Meu trabalho” permanece visível para mostrar apenas as responsabilidades dele.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
              {MODULOS_DASHBOARD.map((item) => {
                const obrigatorio = papel === "colaborador" && item.key === "dashboard_calendario_producao"
                const liberado = obrigatorio || Boolean(permissoes[item.key])
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => alternar(item.key)}
                    aria-disabled={obrigatorio}
                    className="flex items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-muted/50 aria-disabled:cursor-not-allowed aria-disabled:bg-muted/30"
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className={liberado ? "text-primary" : "text-muted-foreground"}>
                      {obrigatorio ? <LockKeyhole className="size-4" aria-label="Acesso mínimo obrigatório" /> : liberado ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </span>
                  </button>
                )
              })}
              </div>
            </div>

            <div className="grid gap-2">
              <div>
                <h3 className="text-sm font-semibold">Acesso às seções</h3>
                <p className="text-xs text-muted-foreground">Defina em quais áreas do ERP este usuário poderá entrar.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
              {MODULOS_SECOES.map((item) => {
                const obrigatorio = papel === "colaborador" && ["dashboard", "escala", "kanban"].includes(item.key)
                const liberado = obrigatorio || Boolean(permissoes[item.key])
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => alternar(item.key)}
                    aria-disabled={obrigatorio}
                    className="flex items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-muted/50 aria-disabled:cursor-not-allowed aria-disabled:bg-muted/30"
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className={liberado ? "text-primary" : "text-muted-foreground"}>
                      {obrigatorio ? <LockKeyhole className="size-4" aria-label="Acesso mínimo obrigatório" /> : liberado ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </span>
                  </button>
                )
              })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={loading || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Salvar acessos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
