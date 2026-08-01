"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Mail, UtensilsCrossed } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState("")
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  async function recuperar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/update-password`,
      })
      if (error) {
        setErro("Não foi possível enviar o e-mail. Tente novamente.")
        return
      }
      setEnviado(true)
    } catch {
      setErro("Erro inesperado ao solicitar a recuperação.")
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
            <CardTitle className="font-heading">Recuperar senha</CardTitle>
            <CardDescription>
              {enviado
                ? "Confira sua caixa de entrada e também a pasta de spam."
                : "Use o mesmo e-mail informado no seu cadastro."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enviado ? (
              <div className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  Se o e-mail estiver cadastrado, enviaremos as instruções para criar uma nova senha.
                </p>
                <Button asChild className="w-full">
                  <Link href="/auth/login">Voltar para o login</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={recuperar} className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="email">E-mail cadastrado</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@salgadou.com"
                    required
                  />
                </div>

                {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}

                <Button type="submit" disabled={carregando} className="w-full">
                  {carregando ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  Enviar e-mail
                </Button>
                <Button variant="ghost" asChild className="w-full">
                  <Link href="/auth/login"><ArrowLeft className="size-4" /> Voltar</Link>
                </Button>
              </form>
            )}

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Não tem mais acesso ao e-mail cadastrado? Procure o administrador.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
