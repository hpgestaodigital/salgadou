"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { KeyRound, Loader2 } from "lucide-react"

export default function TrocarSenhaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [senha, setSenha] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [erro, setErro] = useState("")
  const [loading, setLoading] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro("")

    if (senha.length < 8) {
      return setErro("A senha deve possuir pelo menos 8 caracteres.")
    }

    if (senha !== confirmar) {
      return setErro("As senhas não coincidem.")
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setLoading(false)
      return setErro(error.message)
    }

    const resposta = await fetch("/api/auth/trocar-senha", { method: "POST" })
    const json = await resposta.json()

    if (!resposta.ok) {
      setLoading(false)
      return setErro(json.error || "A senha foi alterada, mas não foi possível liberar o acesso.")
    }

    const { error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) {
      setLoading(false)
      return setErro("A senha foi alterada, mas não foi possível atualizar sua sessão. Entre novamente.")
    }

    router.replace("/")
    router.refresh()
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <KeyRound className="h-7 w-7" />
          </div>

          <CardTitle>Troque sua senha</CardTitle>
          <CardDescription>
            Esta é sua primeira vez acessando o sistema.
            <br />
            Por segurança, defina uma nova senha para continuar.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={salvar} className="space-y-4">
            <div>
              <Label>Nova senha</Label>
              <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>

            <div>
              <Label>Confirmar senha</Label>
              <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            </div>

            {erro && <p className="text-sm text-red-500">{erro}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Salvar nova senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
