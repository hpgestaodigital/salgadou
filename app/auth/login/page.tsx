"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, LogIn, UtensilsCrossed } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
  const supabase = createClient()

  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/auth/ensure-admin", { method: "POST" }).catch(() => {})
  }, [])

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
      if (error) {
        if (error.message.toLowerCase().includes("email not confirmed")) {
          setErro("E-mail ainda não confirmado. Fale com o administrador.")
        } else if (error.status === 400) {
          setErro("E-mail ou senha inválidos.")
        } else {
          setErro("Não foi possível entrar. Tente novamente.")
        }
        return
      }

      // Uma recarga completa impede que dados em cache da conta anterior sejam reutilizados
      // quando o mesmo computador é compartilhado por pessoas diferentes.
      window.location.replace("/")
    } catch {
      setErro("Erro inesperado ao entrar.")
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
            <CardTitle className="font-heading">Acessar o sistema</CardTitle>
            <CardDescription>Entre com seu e-mail e senha.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={entrar} className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="email">E-mail</Label>
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
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="senha">Senha</Label>
                  <Link href="/auth/forgot-password" className="text-xs font-medium text-primary hover:underline">
                    Esqueci minha senha
                  </Link>
                </div>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {erro && (
                <p className="text-sm text-destructive" role="alert">
                  {erro}
                </p>
              )}

              <Button type="submit" disabled={carregando} className="w-full">
                {carregando ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">Uso interno · Salgadou</p>
      </div>
    </main>
  )
}
