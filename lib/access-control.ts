import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { getPapel, type Papel } from "@/lib/auth-roles"

export const MODULOS = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "dashboard_calendario_producao", label: "Calendário da produção", href: "/" },
  { key: "dashboard_fornecedores", label: "Pagamentos de fornecedores", href: "/" },
  { key: "dashboard_motoboys", label: "Pagamentos de motoboys", href: "/" },
  { key: "dashboard_equipe_ativa", label: "Equipe ativa", href: "/" },
  { key: "dashboard_pendencias_colaboradores", label: "Pendências — Colaboradores", href: "/" },
  { key: "dashboard_pendencias_socios", label: "Pendências — Sócios", href: "/" },
  { key: "escala", label: "Escala Semanal", href: "/escala" },
  { key: "kanban", label: "Kanban", href: "/kanban" },
  { key: "reunioes", label: "Reuniões", href: "/reunioes" },
  { key: "juridico", label: "Jurídico", href: "/juridico" },
  { key: "financeiro", label: "Financeiro", href: "/financeiro" },
  { key: "metas", label: "Metas", href: "/metas" },
  { key: "historico", label: "Histórico", href: "/historico" },
  { key: "pagamentos_fornecedores", label: "Pagto. Fornecedores", href: "/pagamentos-fornecedores" },
  { key: "pagamentos_motoboys", label: "Pagto. Motoboys", href: "/pagamentos-motoboys" },
  { key: "cadastros", label: "Cadastros", href: "/cadastros" },
  { key: "usuarios", label: "Usuários e acessos", href: "/usuarios" },
  { key: "configuracoes", label: "Configurações", href: "/configuracoes" },
  { key: "mercado", label: "Mercado", href: "/mercado" },
  { key: "producao_compras", label: "Produção · Lista de compras", href: "/producao?tab=compras" },
  { key: "producao_estoque", label: "Produção · Estoque", href: "/producao?tab=estoque" },
  { key: "producao_planejamento", label: "Produção · Planejamento", href: "/producao?tab=planejamento" },
] as const

export type Modulo = (typeof MODULOS)[number]["key"]
export type Permissoes = Partial<Record<Modulo, boolean>>

export async function carregarPermissoes(user: User): Promise<Permissoes> {
  const supabase = createClient()
  const papel: Papel = getPapel(user)

  const [{ data: padrao, error: padraoError }, { data: individuais, error: individualError }] =
    await Promise.all([
      supabase.from("perfis_permissoes").select("modulo, pode_visualizar").eq("papel", papel),
      supabase.from("usuarios_permissoes").select("modulo, pode_visualizar").eq("usuario_id", user.id),
    ])

  if (padraoError || individualError) {
    if (papel === "admin" || papel === "financeiro" || papel === "socio") {
      return Object.fromEntries(MODULOS.map((item) => [item.key, true])) as Permissoes
    }
    if (papel === "juridico") return { juridico: true }
    return { dashboard: true, dashboard_calendario_producao: true, dashboard_equipe_ativa: true, dashboard_pendencias_colaboradores: true, dashboard_pendencias_socios: true, escala: true, kanban: true }
  }

  const resultado: Permissoes = {}
  for (const item of padrao ?? []) resultado[item.modulo as Modulo] = item.pode_visualizar
  for (const item of individuais ?? []) resultado[item.modulo as Modulo] = item.pode_visualizar
  if (papel === "colaborador") {
    resultado.dashboard = true
    resultado.dashboard_calendario_producao = true
    resultado.escala = true
    resultado.kanban = true
  }
  return resultado
}
