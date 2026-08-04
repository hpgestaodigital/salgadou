"use client"

import type React from "react"
import type { ComponentType } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Bike,
  BookOpenText,
  CalendarDays,
  Factory,
  History,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  PlugZap,
  Scale,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Target,
  Truck,
  Users,
  X,
} from "lucide-react"
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { carregarPermissoes, type Modulo, type Permissoes } from "@/lib/access-control"
import { getNome, getPapel, isAdmin, PAPEL_LABEL, type Papel } from "@/lib/auth-roles"
import { cn } from "@/lib/utils"
import { useTable } from "@/lib/use-data"
import type { Configuracao } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { GlobalGoalsBar } from "@/components/dashboard-goals"
import { CoxinhaIcon, SauceBottleIcon } from "@/components/sidebar-food-icons"

type NavIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>
type NavItem = {
  href: string
  label: string
  icon: NavIcon
  modulo: Modulo | "producao"
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, modulo: "dashboard" },
  { href: "/escala", label: "Escala Semanal", icon: CalendarDays, modulo: "escala" },
  { href: "/kanban", label: "Kanban", icon: KanbanSquare, modulo: "kanban" },
  { href: "/reunioes", label: "Reuniões", icon: MessagesSquare, modulo: "reunioes" },
  { href: "/producao", label: "Produção", icon: Factory, modulo: "producao" },
  { href: "/receitas", label: "Ficha Técnica", icon: BookOpenText, modulo: "producao" },
  { href: "/molhos", label: "Molhos", icon: SauceBottleIcon, modulo: "producao" },
  { href: "/estoque-salgadinhos", label: "Estoque de Salgadinhos", icon: CoxinhaIcon, modulo: "producao" },
  { href: "/integracoes", label: "Integrações", icon: PlugZap, modulo: "producao" },
  { href: "/mercado", label: "Mercado", icon: ShoppingCart, modulo: "mercado" },
  { href: "/financeiro", label: "Leitor de Planilha", icon: Landmark, modulo: "financeiro" },
  { href: "/metas", label: "Metas", icon: Target, modulo: "metas" },
  { href: "/juridico", label: "Jurídico", icon: Scale, modulo: "juridico" },
  { href: "/historico", label: "Histórico", icon: History, modulo: "historico" },
  { href: "/pagamentos-fornecedores", label: "Pagto. Fornecedores", icon: Truck, modulo: "pagamentos_fornecedores" },
  { href: "/pagamentos-motoboys", label: "Pagto. Motoboys", icon: Bike, modulo: "pagamentos_motoboys" },
  { href: "/cadastros", label: "Cadastros", icon: Users, modulo: "cadastros" },
  { href: "/usuarios", label: "Usuários", icon: ShieldCheck, modulo: "usuarios" },
  { href: "/configuracoes", label: "Configurações", icon: Settings, modulo: "configuracoes" },
]

type SessaoUI = {
  nome: string
  papel: Papel
  admin: boolean
  avatarUrl: string
  permissoes: Permissoes
} | null

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [menuAberto, setMenuAberto] = useState(false)
  const [sessao, setSessao] = useState<SessaoUI>(null)
  const { data: configuracoes, mutate: mutateConfiguracoes } = useTable<Configuracao>("configuracoes")
  const logoUrl = configuracoes.find((item) => item.chave === "brand_logo_url")?.valor || process.env.NEXT_PUBLIC_BRAND_LOGO_URL || ""

  useEffect(() => {
    let ativo = true

    async function carregarSessao(user: import("@supabase/supabase-js").User | null) {
      if (!ativo) return
      if (!user) {
        setSessao(null)
        return
      }
      const permissoes = await carregarPermissoes(user)
      if (!ativo) return
      setSessao({
        nome: getNome(user),
        papel: getPapel(user),
        admin: isAdmin(user),
        avatarUrl: String(user.user_metadata?.avatar_url ?? ""),
        permissoes,
      })
    }

    supabase.auth.getUser().then(({ data }) => carregarSessao(data.user))
    const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      void carregarSessao(session?.user ?? null)
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

  if (pathname.startsWith("/auth")) return <>{children}</>

  const itens = NAV.filter((item) => {
    if (!sessao) return false
    if (item.modulo === "producao") {
      return Boolean(
        sessao.permissoes.producao_compras ||
        sessao.permissoes.producao_estoque ||
        sessao.permissoes.producao_planejamento,
      )
    }
    if (item.modulo === "mercado") return Boolean(sessao.permissoes.producao_compras)
    return Boolean(sessao.permissoes[item.modulo])
  })

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarContent pathname={pathname} itens={itens} sessao={sessao} logoUrl={logoUrl} onSair={sair} />
      </aside>

      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/50" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl">
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon" onClick={() => setMenuAberto(false)} aria-label="Fechar menu"><X className="size-5" /></Button>
            </div>
            <SidebarContent pathname={pathname} itens={itens} sessao={sessao} logoUrl={logoUrl} onSair={sair} onNavigate={() => setMenuAberto(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Button variant="outline" size="icon" onClick={() => setMenuAberto(true)} aria-label="Abrir menu"><Menu className="size-5" /></Button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Salgadou Gestão</p>
            <p className="text-xs text-muted-foreground">Painel interno</p>
          </div>
        </header>

        {pathname !== "/" && (
          <div className="mx-auto w-full max-w-[1480px] px-4 pt-3 sm:px-6 lg:px-8 lg:pt-4 xl:px-10">
            <GlobalGoalsBar />
          </div>
        )}

        <main className={cn("mx-auto w-full max-w-[1480px] flex-1 p-4 sm:p-6 lg:p-8 xl:p-10", pathname !== "/" && "pt-4 sm:pt-5 lg:pt-6 xl:pt-6")}>
          {children}
        </main>
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
  itens: NavItem[]
  sessao: SessaoUI
  logoUrl: string
  onSair: () => void
  onNavigate?: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 py-7">
        <span className="grid size-11 place-items-center overflow-hidden rounded-full bg-primary text-lg font-heading font-black text-primary-foreground">
          {logoUrl ? <img src={logoUrl} alt="Logo da Salgadou" className="size-full object-cover" /> : "S"}
        </span>
        <div className="leading-tight">
          <p className="font-heading text-xl font-extrabold tracking-tight">Salgadou</p>
          <p className="text-xs text-sidebar-foreground/60">Gestão Interna</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
        {itens.map((item) => {
          const ativo = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold outline-none transition-colors",
                ativo ? "bg-[#352a25] text-[#fff7ef]" : "text-[#eee8e2] hover:bg-white/[0.055] hover:text-[#fffaf5]",
              )}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-4">
        {sessao && (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/[0.035] px-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
              {sessao.avatarUrl ? <img src={sessao.avatarUrl} alt={`Avatar de ${sessao.nome}`} className="size-full object-cover" /> : sessao.nome.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{sessao.nome}</p>
              <p className="text-xs text-sidebar-foreground/60">{PAPEL_LABEL[sessao.papel]}</p>
            </div>
          </div>
        )}
        <Button variant="ghost" onClick={onSair} className="w-full justify-start gap-3 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <LogOut className="size-[18px]" />Sair
        </Button>
      </div>
    </>
  )
}
