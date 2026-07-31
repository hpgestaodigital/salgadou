import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Save } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import {
  getSettings,
  saveSettings,
  sendTestMessage,
  listTemplates,
  saveTemplate,
  listLogs,
} from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações e WhatsApp | Salgadou Gestão" },
      {
        name: "description",
        content:
          "Configure a Evolution API, modelos de mensagem e acompanhe o histórico de lembretes.",
      },
      { property: "og:title", content: "Configurações e WhatsApp | Salgadou Gestão" },
      {
        property: "og:description",
        content: "Evolution API, modelos de mensagem e histórico de envios.",
      },
    ],
  }),
  component: SettingsPage,
});

const TEMPLATE_LABEL: Record<string, string> = {
  escala_semanal: "Escala semanal",
  pagamento_fornecedor: "Pagamento de fornecedor",
  pagamento_motoboy: "Fechamento de motoboy",
};

function SettingsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getSettings);
  const persist = useServerFn(saveSettings);
  const test = useServerFn(sendTestMessage);
  const templatesFn = useServerFn(listTemplates);
  const saveTpl = useServerFn(saveTemplate);
  const logsFn = useServerFn(listLogs);

  const [url, setUrl] = useState("");
  const [instance, setInstance] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testPhone, setTestPhone] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["evolution-settings"],
    queryFn: () => load({ data: undefined }),
  });

  const { data: templates } = useQuery({
    queryKey: ["notification-templates"],
    queryFn: () => templatesFn({ data: undefined }),
  });

  const { data: logs } = useQuery({
    queryKey: ["notification-logs"],
    queryFn: () => logsFn({ data: undefined }),
  });

  useEffect(() => {
    if (!settings) return;
    setUrl(settings.evolution_url);
    setInstance(settings.evolution_instance);
    setTestPhone(settings.test_phone);
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      persist({
        data: {
          evolution_url: url,
          evolution_instance: instance,
          evolution_api_key: apiKey || undefined,
          test_phone: testPhone,
        },
      }),
    onSuccess: () => {
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["evolution-settings"] });
      toast.success("Configuração salva.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: () => test({ data: { phone: testPhone } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["notification-logs"] });
      qc.invalidateQueries({ queryKey: ["evolution-settings"] });
      if (res.ok) toast.success("Mensagem de teste enviada.");
      else toast.error(res.error ?? "Falha ao enviar.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTemplate = useMutation({
    mutationFn: (input: { id: string; body: string; active: boolean }) =>
      saveTpl({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-templates"] });
      toast.success("Modelo atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Integração WhatsApp via Evolution API"
      />

      <Tabs defaultValue="conexao">
        <TabsList className="mb-4">
          <TabsTrigger value="conexao">Conexão</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="conexao">
          <div className="surface-panel max-w-xl space-y-4 p-5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge
                variant="outline"
                className={
                  settings?.connection_status === "conectado"
                    ? "border-success/30 bg-success/15 text-success"
                    : settings?.connection_status === "erro"
                      ? "border-destructive/30 bg-destructive/15 text-destructive"
                      : ""
                }
              >
                {settings?.connection_status ?? "desconhecido"}
              </Badge>
            </div>
            {settings?.last_error && (
              <p className="text-xs text-destructive">{settings.last_error}</p>
            )}
            <div className="space-y-1.5">
              <Label>URL da Evolution API</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://evolution.seudominio.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instância</Label>
              <Input value={instance} onChange={(e) => setInstance(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>API Key {settings?.has_api_key && "(já configurada)"}</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.has_api_key ? "••••••••" : "Cole a chave"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone para teste</Label>
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="(11) 91234-5678"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="mr-1 h-4 w-4" /> Salvar
              </Button>
              <Button
                variant="secondary"
                onClick={() => sendTest.mutate()}
                disabled={sendTest.isPending || !testPhone}
              >
                <Send className="mr-1 h-4 w-4" /> Enviar teste
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="modelos">
          <div className="grid gap-3 lg:grid-cols-2">
            {templates?.map((t) => (
              <TemplateCard
                key={t.id}
                id={t.id}
                title={TEMPLATE_LABEL[t.key] ?? t.key}
                initialBody={t.body}
                initialActive={t.active}
                onSave={(body, active) => updateTemplate.mutate({ id: t.id, body, active })}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="historico">
          <div className="surface-panel overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Destinatário</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs?.map((l) => (
                  <tr key={l.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-3 py-2">{TEMPLATE_LABEL[l.type] ?? l.type}</td>
                    <td className="px-3 py-2">
                      {l.recipient_name ?? "—"}
                      <span className="block text-xs text-muted-foreground">
                        {l.phone ?? ""}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          l.status === "enviado"
                            ? "border-success/30 bg-success/15 text-success"
                            : "border-destructive/30 bg-destructive/15 text-destructive"
                        }
                      >
                        {l.status}
                      </Badge>
                      {l.error && (
                        <span className="block text-xs text-destructive">{l.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplateCard({
  title,
  initialBody,
  initialActive,
  onSave,
}: {
  id: string;
  title: string;
  initialBody: string;
  initialActive: boolean;
  onSave: (body: string, active: boolean) => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [active, setActive] = useState(initialActive);

  return (
    <div className="surface-panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-semibold">{title}</p>
        <Switch checked={active} onCheckedChange={setActive} />
      </div>
      <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="text-xs text-muted-foreground">
        Use variáveis entre chaves, ex.: {"{nome}"}, {"{valor}"}, {"{vencimento}"}.
      </p>
      <Button size="sm" onClick={() => onSave(body, active)}>
        Salvar modelo
      </Button>
    </div>
  );
}
