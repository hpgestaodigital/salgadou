import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, LockKeyhole } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ensureBootstrap } from "@/lib/bootstrap.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrar | Salgadou Gestão" },
      {
        name: "description",
        content:
          "Acesso restrito aos sócios da Salgadou. Gestão de escala, tarefas e pagamentos.",
      },
      { property: "og:title", content: "Entrar | Salgadou Gestão" },
      {
        property: "og:description",
        content: "Acesso restrito aos sócios da Salgadou.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const bootstrap = useServerFn(ensureBootstrap);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    bootstrap({}).catch(() => undefined);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [bootstrap, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível entrar. Verifique suas credenciais.");
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
            <span className="font-display text-2xl font-bold">S</span>
          </div>
          <h1 className="font-display text-2xl font-bold">Salgadou Gestão</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Área interna — acesso somente para sócios
          </p>
        </div>

        <form onSubmit={handleSubmit} className="surface-panel space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@salgadou.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LockKeyhole className="mr-2 h-4 w-4" />
            )}
            Entrar
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Fornecedores, motoboys, colaboradores e freelancers não possuem acesso.
          </p>
        </form>
      </div>
    </main>
  );
}
