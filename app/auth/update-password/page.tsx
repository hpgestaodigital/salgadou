"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CheckCircle2, KeyRound, Loader2, UtensilsCrossed } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function UpdatePasswordPage() {
  const supabase = createClient()
  const [senha, setSenha] = useState("")
  const [confirmacao, setConfirmacao] = useState("")
  const [carregando, setCarregando] = useState(false)
  const [sessaoPronta, setSessaoPronta] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (ativo && data.session) setSessaoPronta(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((evento: AuthChangeEvent, sessao: Session | null) => {
      if (ativo && (evento === "PASSWORD_RECOVERY" || sessao)) setSessaoPronta(true)
    })

    return () => {
      ativo = false
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  async function atualizar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (senha.length < 8 || senha.length > 128) {
      setErro("A nova senha precisa ter entre 8 e 128 caracteres.")
      return
    }
    if (senha !== confirmacao) {
      setErro("As senhas não são iguais.")
      return
    }

    setCarregando(true)
    try {
      const resposta = await fetch("/api/auth/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novaSenha: senha }),
      })
      if (!resposta.ok) {
        const json = await resposta.json().catch(() => null)
        setErro(json?.error || "O link é inválido ou expirou. Solicite um novo e-mail de recuperação.")
        return
      }

      setConcluido(true)
      await supabase.auth.signOut()
    } catch {
      setErro("Não foi possível atualizar a senha. Solicite um novo link.")
    } finally {
      setCarregando(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <UtensilsCrossed className="size-6" />
          </span>
          <div className="text-center">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight">Salgadou</h1>
            <p className="text-sm text-muted-foreground">Gestão Interna</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Criar nova senha</CardTitle>
            <CardDescription>
              {concluido ? "Sua senha foi alterada com sucesso." : "Escolha uma senha nova para acessar o sistema."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {concluido ? (
              <div className="grid gap-4 text-center">
                <CheckCircle2 className="mx-auto size-10 text-primary" />
                <Button asChild className="w-full">
                  <Link href="/auth/login">Entrar com a nova senha</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={atualizar} className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="senha">Nova senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    autoComplete="new-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="confirmacao">Confirmar nova senha</Label>
                  <Input
                    id="confirmacao"
                    type="password"
                    autoComplete="new-password"
                    value={confirmacao}
                    onChange={(e) => setConfirmacao(e.target.value)}
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </div>

                {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
                {!sessaoPronta && (
                  <p className="text-sm text-muted-foreground">Validando o link de recuperação...</p>
                )}

                <Button type="submit" disabled={carregando || !sessaoPronta} className="w-full">
                  {carregando ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                  Salvar nova senha
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
