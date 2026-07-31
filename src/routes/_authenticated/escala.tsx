import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, CopyPlus, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { sendManualReminder } from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money, formatDate, todayISO, weekStartISO, addDaysISO, WEEKDAYS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/escala")({
  head: () => ({
    meta: [
      { title: "Escala semanal | Salgadou Gestão" },
      {
        name: "description",
        content:
          "Montagem da escala semanal da equipe Salgadou com diárias, períodos e ocorrências.",
      },
      { property: "og:title", content: "Escala semanal | Salgadou Gestão" },
      {
        property: "og:description",
        content: "Escala semanal da equipe Salgadou com diárias e ocorrências.",
      },
    ],
  }),
  component: SchedulePage,
});

type Occurrence =
  | "trabalho"
  | "folga"
  | "falta_justificada_previa"
  | "falta_justificada_posterior"
  | "falta_nao_justificada";

const OCCURRENCES: { value: Occurrence; label: string; tone: string }[] = [
  { value: "trabalho", label: "Trabalho", tone: "bg-success/15 text-success border-success/30" },
  { value: "folga", label: "Folga", tone: "bg-secondary text-muted-foreground border-border" },
  {
    value: "falta_justificada_previa",
    label: "Falta justificada (prévia)",
    tone: "bg-warning/15 text-warning border-warning/30",
  },
  {
    value: "falta_justificada_posterior",
    label: "Falta justificada (posterior)",
    tone: "bg-warning/15 text-warning border-warning/30",
  },
  {
    value: "falta_nao_justificada",
    label: "Falta não justificada",
    tone: "bg-destructive/15 text-destructive border-destructive/30",
  },
];

const PERIODS = ["manha", "tarde", "noite"] as const;
const PERIOD_LABEL: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

type Cell = {
  employeeId: string;
  dayIndex: number;
  id?: string;
  occurrence: Occurrence;
  periods: string[];
  daily_rate: number;
  notes: string;
};

function SchedulePage() {
  const qc = useQueryClient();
  const remind = useServerFn(sendManualReminder);
  const [weekStart, setWeekStart] = useState(() => weekStartISO(todayISO()));
  const [cell, setCell] = useState<Cell | null>(null);

  const { data: employees } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, role, daily_rate, phone")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: week } = useQuery({
    queryKey: ["schedule-week", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_weeks")
        .select("*")
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["schedule-entries", week?.id],
    enabled: Boolean(week?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_entries")
        .select("*")
        .eq("week_id", week!.id);
      if (error) throw error;
      return data;
    },
  });

  const map = useMemo(() => {
    const m = new Map<string, (typeof entries extends undefined ? never : any)>();
    (entries ?? []).forEach((e) => m.set(`${e.employee_id}:${e.day_index}`, e));
    return m;
  }, [entries]);

  const ensureWeek = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("schedule_weeks")
        .insert({ week_start: weekStart })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-week", weekStart] });
      toast.success("Semana criada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCell = useMutation({
    mutationFn: async (c: Cell) => {
      if (!week?.id) throw new Error("Crie a semana antes de lançar a escala.");
      const payload = {
        week_id: week.id,
        employee_id: c.employeeId,
        day_index: c.dayIndex,
        occurrence: c.occurrence,
        periods: c.occurrence === "trabalho" ? c.periods : [],
        daily_rate: c.occurrence === "trabalho" ? c.daily_rate : 0,
        notes: c.notes || null,
      };
      if (c.id) {
        const { error } = await supabase
          .from("schedule_entries")
          .update(payload)
          .eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("schedule_entries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-entries", week?.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Escala atualizada.");
      setCell(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateWeek = useMutation({
    mutationFn: async () => {
      if (!week?.id) throw new Error("Não há semana para duplicar.");
      const nextStart = addDaysISO(weekStart, 7);
      const { data: existing } = await supabase
        .from("schedule_weeks")
        .select("id")
        .eq("week_start", nextStart)
        .maybeSingle();
      let targetId = existing?.id;
      if (!targetId) {
        const { data, error } = await supabase
          .from("schedule_weeks")
          .insert({ week_start: nextStart })
          .select("id")
          .single();
        if (error) throw error;
        targetId = data.id;
      } else {
        await supabase.from("schedule_entries").delete().eq("week_id", targetId);
      }
      const rows = (entries ?? []).map((e) => ({
        week_id: targetId!,
        employee_id: e.employee_id,
        day_index: e.day_index,
        occurrence: e.occurrence,
        periods: e.periods,
        daily_rate: e.daily_rate,
        notes: e.notes,
      }));
      if (rows.length) {
        const { error } = await supabase.from("schedule_entries").insert(rows);
        if (error) throw error;
      }
      return nextStart;
    },
    onSuccess: (next) => {
      toast.success("Semana duplicada.");
      setWeekStart(next);
      qc.invalidateQueries({ queryKey: ["schedule-week", next] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCell(employeeId: string, dayIndex: number, fallbackRate: number) {
    const existing = map.get(`${employeeId}:${dayIndex}`);
    setCell({
      employeeId,
      dayIndex,
      id: existing?.id,
      occurrence: (existing?.occurrence as Occurrence) ?? "trabalho",
      periods: Array.isArray(existing?.periods) ? (existing!.periods as string[]) : ["manha"],
      daily_rate: Number(existing?.daily_rate ?? fallbackRate ?? 0),
      notes: existing?.notes ?? "",
    });
  }

  const weekTotal = (entries ?? []).reduce(
    (a, e) => a + (e.occurrence === "trabalho" ? Number(e.daily_rate) : 0),
    0,
  );

  async function notify(employeeId: string) {
    const res = await remind({ data: { kind: "escala_semanal", id: employeeId } });
    if (res.ok) toast.success("Escala enviada.");
    else toast.error(res.error ?? "Falha ao enviar.");
  }

  return (
    <div>
      <PageHeader
        title="Escala semanal"
        subtitle={`${formatDate(weekStart)} a ${formatDate(addDaysISO(weekStart, 6))} · Diárias: ${money(weekTotal)}`}
        actions={
          <>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Semana anterior"
              onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              className="w-40"
              value={weekStart}
              onChange={(e) =>
                e.target.value && setWeekStart(weekStartISO(e.target.value))
              }
            />
            <Button
              variant="secondary"
              size="icon"
              aria-label="Próxima semana"
              onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {week && (
              <Button
                variant="secondary"
                onClick={() => duplicateWeek.mutate()}
                disabled={duplicateWeek.isPending}
              >
                <CopyPlus className="mr-1 h-4 w-4" /> Duplicar p/ próxima
              </Button>
            )}
          </>
        }
      />

      {!week ? (
        <EmptyState
          title="Semana não iniciada"
          description="Crie a semana para começar a lançar a escala da equipe."
          action={
            <Button className="mt-2" onClick={() => ensureWeek.mutate()}>
              Criar semana
            </Button>
          }
        />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (employees?.length ?? 0) === 0 ? (
        <EmptyState
          title="Nenhum colaborador ativo"
          description="Cadastre colaboradores em Cadastros para montar a escala."
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 font-medium">Colaborador</th>
                {WEEKDAYS.map((d, i) => (
                  <th key={d} className="px-2 py-2 font-medium">
                    {d}
                    <span className="ml-1 normal-case text-[10px]">
                      {formatDate(addDaysISO(weekStart, i)).slice(0, 5)}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {employees?.map((emp) => {
                const rowTotal = WEEKDAYS.reduce((acc, _d, i) => {
                  const e = map.get(`${emp.id}:${i}`);
                  return acc + (e?.occurrence === "trabalho" ? Number(e.daily_rate) : 0);
                }, 0);
                return (
                  <tr key={emp.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-medium">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.role ?? "—"}</p>
                    </td>
                    {WEEKDAYS.map((_d, i) => {
                      const e = map.get(`${emp.id}:${i}`);
                      const occ = OCCURRENCES.find(
                        (o) => o.value === (e?.occurrence ?? "folga"),
                      )!;
                      return (
                        <td key={i} className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => openCell(emp.id, i, Number(emp.daily_rate))}
                            className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:opacity-90 ${
                              e ? occ.tone : "border-dashed border-border text-muted-foreground"
                            }`}
                          >
                            {e ? (
                              <>
                                <span className="block font-medium">
                                  {e.occurrence === "trabalho"
                                    ? (Array.isArray(e.periods) ? e.periods : [])
                                        .map((p: string) => PERIOD_LABEL[p] ?? p)
                                        .join(" · ") || "Trabalho"
                                    : occ.label}
                                </span>
                                {e.occurrence === "trabalho" && (
                                  <span className="block opacity-80">
                                    {money(e.daily_rate)}
                                  </span>
                                )}
                              </>
                            ) : (
                              "+ lançar"
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 font-semibold">{money(rowTotal)}</td>
                    <td className="px-2 py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Enviar escala no WhatsApp"
                        onClick={() => void notify(emp.id)}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(cell)} onOpenChange={(v) => !v && setCell(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {cell ? `${WEEKDAYS[cell.dayIndex]} — lançamento` : ""}
            </DialogTitle>
          </DialogHeader>
          {cell && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Ocorrência</Label>
                <Select
                  value={cell.occurrence}
                  onValueChange={(v) => setCell({ ...cell, occurrence: v as Occurrence })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCURRENCES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {cell.occurrence === "trabalho" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Períodos</Label>
                    <div className="flex gap-4">
                      {PERIODS.map((p) => (
                        <label key={p} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={cell.periods.includes(p)}
                            onCheckedChange={(checked) =>
                              setCell({
                                ...cell,
                                periods: checked
                                  ? [...cell.periods, p]
                                  : cell.periods.filter((x) => x !== p),
                              })
                            }
                          />
                          {PERIOD_LABEL[p]}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor da diária</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={cell.daily_rate}
                      onChange={(e) =>
                        setCell({ ...cell, daily_rate: Number(e.target.value) })
                      }
                    />
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label>Observação</Label>
                <Textarea
                  value={cell.notes}
                  onChange={(e) => setCell({ ...cell, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCell(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => cell && saveCell.mutate(cell)}
              disabled={saveCell.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
