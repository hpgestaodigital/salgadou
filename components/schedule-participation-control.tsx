"use client"

import { useMemo, useState } from "react"
import { CalendarDays, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useTable } from "@/lib/use-data"
import { isSocio, type Colaborador } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

export function ScheduleParticipationControl({
  contexto,
}: {
  contexto: "socios" | "colaboradores"
}) {
  const supabase = createClient()
  const { data, isLoading, mutate } = useTable<Colaborador>("colaboradores", { column: "nome" })
  const [savingId, setSavingId] = useState<string | null>(null)

  const pessoas = useMemo(
    () => data.filter((pessoa) => (contexto === "socios" ? isSocio(pessoa) : !isSocio(pessoa))),
    [contexto, data],
  )

  async function alterar(pessoa: Colaborador, participa_escala: boolean) {
    setSavingId(pessoa.id)
    const { error } = await supabase
      .from("colaboradores")
      .update({ participa_escala })
      .eq("id", pessoa.id)

    setSavingId(null)

    if (error) {
      toast.error("Não foi possível atualizar a participação na escala.")
      return
    }

    toast.success(
      participa_escala
        ? `${pessoa.nome} voltou para a Escala Semanal.`
        : `${pessoa.nome} foi retirado da Escala Semanal, mas continua ativo no ERP.`,
    )
    await mutate()
  }

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <CalendarDays className="size-4" />
        </div>
        <div>
          <p className="font-semibold">Participação na Escala Semanal</p>
          <p className="text-sm text-muted-foreground">
            Retirar alguém daqui não desativa o cadastro. A pessoa continua disponível para reuniões,
            tarefas e acompanhamentos do ERP.
          </p>
        </div>
      </div>

      <div className="divide-y rounded-lg border">
        {isLoading ? (
          <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Carregando pessoas...
          </div>
        ) : pessoas.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum cadastro nesta categoria.</p>
        ) : (
          pessoas.map((pessoa) => {
            const participa = pessoa.participa_escala !== false
            const saving = savingId === pessoa.id
            return (
              <div key={pessoa.id} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{pessoa.nome}</span>
                    {!pessoa.ativo && <Badge variant="secondary">Cadastro inativo</Badge>}
                    {!participa && <Badge variant="outline">Fora da escala</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {participa ? "Aparece na montagem da escala." : "Continua ativo nos outros módulos do ERP."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                  <Switch
                    aria-label={`Participação de ${pessoa.nome} na escala semanal`}
                    checked={participa}
                    disabled={savingId !== null}
                    onCheckedChange={(checked) => void alterar(pessoa, checked)}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
