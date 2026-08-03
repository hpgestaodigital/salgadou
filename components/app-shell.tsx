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
  KanbanSquare,
  ShieldCheck,
  LogOut,
  MessagesSquare,
  Scale,
  History,
  Factory,
  Landmark,
  Presentation,
  Target,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { getNome, getPapel, isAdmin, PAPEL_LABEL, type Papel } from "@/lib/auth-roles"
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"
import { useTable } from "@/lib/use-data"
import type { Configuracao } from "@/lib/types"
import { carregarPermissoes, type Modulo, type Permissoes } from "@/lib/access-control"
import { GlobalGoalsBar } from "@/components/dashboard-goals"

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, modulo: "dashboard" as Modulo },
  { href: "/escala", label: "Escala Semanal", icon: CalendarDays, modulo: "escala" as Modulo },
  { href: "/kanban", label: "Kanban", icon: KanbanSquare, modulo: "kanban" as Modulo },
  { href: "/reunioes", label: "Reuniões", icon: MessagesSquare, modulo: "reunioes" as Modulo },
  { href: "/producao", label: "Produção", icon: Factory, modulo: "producao" as const },
  { href: "/financeiro", label: "Financeiro", icon: Landmark, modulo: "financeiro" as Modulo },
  { href: "/metas", label: "Metas", icon: Target, modulo: "metas" as Modulo },
  { href: "/juridico", label: "Jurídico", icon: Scale, modulo: "juridico" as Modulo },
  { href: "/historico", label: "Histórico", icon: History, modulo: "historico" as Modulo },
  { href: "/pagamentos-fornecedores", label: "Pagto. Fornecedores", icon: Truck, modulo: "pagamentos_fornecedores" as Modulo },
  { href: "/pagamentos-motoboys", label: "Pagto. Motoboys", icon: Bike, modulo: "pagamentos_motoboys" as Modulo },
  { href: "/cadastros", label: "Cadastros", icon: Users, modulo: "cadastros" as Modulo },
  { href: "/usuarios", label: "Usuários", icon: ShieldCheck, modulo: "usuarios" as Modulo },
  { href: "/demonstracao", label: "Demonstração", icon: Presentation, modulo: "dashboard" as Modulo, adminOnly: true },
  { href: "/configuracoes", label: "Configurações", icon: Settings, modulo: "configuracoes" as Modulo },
]

type SessaoUI = { nome: string; papel: Papel; admin: boolean; avatarUrl: string; permissoes: Permissoes } | null

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [sessao, setSessao] = useState<SessaoUI>(null)
  const { data: configuracoes, mutate: mutateConfiguracoes } = useTable<Configuracao>("configuracoes")
  const logoUrl =
    configuracoes.find((item) => item.chave === "brand_logo_url")?.valor ||
    process.env.NEXT_PUBLIC_BRAND_LOGO_URL ||
    ""

  useEffect(() => {
    let ativo = true
    supabase.auth.getUser().then(({ data }: { data: { user: import("@supabase/supabase-js").User | null } }) => {
      if (!ativo) return
      const u = data.user
      if (!u) return setSessao(null)
      carregarPermissoes(u).then((permissoes) => {
        if (ativo) setSessao({ nome: getNome(u), papel: getPapel(u), admin: isAdmin(u), avatarUrl: String(u.user_metadata?.avatar_url ?? ""), permissoes })
      })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const u = session?.user ?? null
      if (!u) return setSessao(null)
      carregarPermissoes(u).then((permissoes) => setSessao({ nome: getNome(u), papel: getPapel(u), admin: isAdmin(u), avatarUrl: String(u.user_metadata?.avatar_url ?? ""), permissoes }))
    })
    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    const atualizar = () => mutateConfiguracoes()
    window.addEventListener("salgadou:branding-updated", atualizar)
    return () => window.removeEventListener("salgadou:branding-updated", atualizar)
  }, [mutateConfiguracoes])

  async function sair() {
    await supabase.auth.signOut()
    router.replace("/auth/login")
    router.refresh()
  }

  // Telas de autenticação não usam o layout com a barra lateral.
  if (pathname.startsWith("/auth")) {
    return <>{children}</>
  }

  const itens = NAV.filter((item) => {
    if (!sessao) return false
    if ("adminOnly" in item && item.adminOnly && !sessao.admin) return false
    if (item.modulo === "producao") {
      return Boolean(
        sessao.permissoes.producao_compras ||
        sessao.permissoes.producao_estoque ||
        sessao.permissoes.producao_planejamento
      )
    }
    return Boolean(sessao.permissoes[item.modulo])
  })

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex sticky top-0 h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <SidebarContent pathname={pathname} itens={itens} sessao={sessao} logoUrl={logoUrl} onSair={sair} />
      </aside>

      {/* Sidebar - mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 h-full w-72 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-2xl">
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
            <SidebarContent pathname={pathname} itens={itens} sessao={sessao} logoUrl={logoUrl} onSair={sair} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-xl">
          <Button variant="outline" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="size-5" />
          </Button>
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-full bg-primary font-heading font-black text-primary-foreground lg:hidden">S</span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Salgadou Gestão</p>
              <p className="hidden text-xs text-muted-foreground lg:block">Visão operacional em tempo real</p>
            </div>
          </div>
        </header>
        {pathname !== "/" && (
          <div className="mx-auto w-full max-w-[1480px] px-4 pt-3 sm:px-6 lg:px-8 lg:pt-4 xl:px-10">
            <GlobalGoalsBar />
          </div>
        )}
        <main className={cn("flex-1 p-4 sm:p-6 lg:p-8 xl:p-10 max-w-[1480px] w-full mx-auto", pathname !== "/" && "pt-4 sm:pt-5 lg:pt-6 xl:pt-6")}>{children}</main>
      </div>
    </div>
  )
}

function SidebarContent({
  pathname,
  itens,
  sessao,
  logoUrl,
  onSair,
  onNavigate,
}: {
  pathname: string
  itens: typeof NAV
  sessao: SessaoUI
  logoUrl: string
  onSair: () => void
  onNavigate?: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-7">
        <span className="grid size-11 place-items-center overflow-hidden rounded-full bg-primary text-lg font-heading font-black text-primary-foreground shadow-[0_0_35px_rgba(234,106,47,.2)]">
          {logoUrl ? <img src={logoUrl} alt="Logo da Salgadou" className="size-full object-cover" /> : "S"}
        </span>
        <div className="leading-tight">
          <p className="font-heading text-xl font-extrabold tracking-tight">Salgadou</p>
          <p className="text-xs text-sidebar-foreground/60">Gestão Interna</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 flex flex-col gap-1.5 overflow-y-auto">
        {itens.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150 outline-none",
                "focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                active
                  ? "bg-[#352a25] text-[#fff7ef] shadow-[inset_0_0_0_1px_rgba(255,255,255,.035)]"
                  : "text-[#eee8e2] hover:bg-white/[0.055] hover:text-[#fffaf5]",
              )}
            >
              <Icon className="size-[18px] shrink-0 text-current" aria-hidden="true" />
              <span className="text-current">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border">
        {sessao && (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/[0.035] px-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
              {sessao.avatarUrl ? (
                <img src={sessao.avatarUrl} alt={`Avatar de ${sessao.nome}`} className="size-full object-cover" />
              ) : (
                sessao.nome.slice(0, 2).toUpperCase()
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{sessao.nome}</p>
              <p className="text-xs text-sidebar-foreground/60">{PAPEL_LABEL[sessao.papel]}</p>
            </div>
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
