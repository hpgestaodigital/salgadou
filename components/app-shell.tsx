"use client"

import type React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  LayoutDashboard,
  CalendarDays,
  Truck,
  Bike,
  Users,
  Settings,
  Menu,
  X,
  UtensilsCrossed,
  KanbanSquare,
  ShieldCheck,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { getNome, getPapel, isAdmin, PAPEL_LABEL, type Papel } from "@/lib/auth-roles"

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/escala", label: "Escala Semanal", icon: CalendarDays, adminOnly: false },
  { href: "/kanban", label: "Kanban", icon: KanbanSquare, adminOnly: false },
  { href: "/pagamentos-fornecedores", label: "Pagto. Fornecedores", icon: Truck, adminOnly: false },
  { href: "/pagamentos-motoboys", label: "Pagto. Motoboys", icon: Bike, adminOnly: false },
  { href: "/cadastros", label: "Cadastros", icon: Users, adminOnly: false },
  { href: "/usuarios", label: "Usuários", icon: ShieldCheck, adminOnly: true },
  { href: "/configuracoes", label: "Configurações", icon: Settings, adminOnly: false },
]

type SessaoUI = { nome: string; papel: Papel; admin: boolean } | null

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [sessao, setSessao] = useState<SessaoUI>(null)

  useEffect(() => {
    let ativo = true
    supabase.auth.getUser().then(({ data }) => {
      if (!ativo) return
      const u = data.user
      setSessao(u ? { nome: getNome(u), papel: getPapel(u), admin: isAdmin(u) } : null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setSessao(u ? { nome: getNome(u), papel: getPapel(u), admin: isAdmin(u) } : null)
    })
    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  async function sair() {
    await supabase.auth.signOut()
    router.replace("/auth/login")
    router.refresh()
  }

  // Telas de autenticação não usam o layout com a barra lateral.
  if (pathname.startsWith("/auth")) {
    return <>{children}</>
  }

  const itens = NAV.filter((item) => !item.adminOnly || sessao?.admin)

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <SidebarContent pathname={pathname} itens={itens} sessao={sessao} onSair={sair} />
      </aside>

      {/* Sidebar - mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 h-full w-64 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
            <div className="flex justify-end p-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="Fechar menu"
              >
                <X className="size-5" />
              </Button>
            </div>
            <SidebarContent pathname={pathname} itens={itens} sessao={sessao} onSair={sair} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <Button variant="outline" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="size-5" />
          </Button>
          <div className="flex items-center gap-2 font-heading font-extrabold text-lg">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <UtensilsCrossed className="size-4" />
            </span>
            Salgadou
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  )
}

function SidebarContent({
  pathname,
  itens,
  sessao,
  onSair,
  onNavigate,
}: {
  pathname: string
  itens: typeof NAV
  sessao: SessaoUI
  onSair: () => void
  onNavigate?: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-6">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <UtensilsCrossed className="size-5" />
        </span>
        <div className="leading-tight">
          <p className="font-heading text-xl font-extrabold tracking-tight">Salgadou</p>
          <p className="text-xs text-sidebar-foreground/60">Gestão Interna</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 flex flex-col gap-1 overflow-y-auto">
        {itens.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border">
        {sessao && (
          <div className="mb-2 px-2">
            <p className="text-sm font-semibold truncate">{sessao.nome}</p>
            <p className="text-xs text-sidebar-foreground/60">{PAPEL_LABEL[sessao.papel]}</p>
          </div>
        )}
        <Button
          variant="ghost"
          onClick={onSair}
          className="w-full justify-start gap-3 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-[18px]" />
          Sair
        </Button>
      </div>
    </>
  )
}
