import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { getPapel, type Papel } from "@/lib/auth-roles"

export const MODULOS = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "dashboard_calendario_producao", label: "Agenda da semana", href: "/" },
  { key: "dashboard_fornecedores", label: "Resumo de fornecedores", href: "/" },
  { key: "dashboard_motoboys", label: "Resumo de motoboys", href: "/" },
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

function fallbackPorPapel(papel: Papel): Permissoes {
  if (papel === "admin") return Object.fromEntries(MODULOS.map((item) => [item.key, true])) as Permissoes
  if (papel === "socio") {
    return {
      dashboard: true,
      dashboard_calendario_producao: true,
      escala: true,
      kanban: true,
      reunioes: true,
    }
  }
  if (papel === "financeiro") {
    return {
      dashboard: true,
      dashboard_fornecedores: true,
      dashboard_motoboys: true,
      financeiro: true,
      pagamentos_fornecedores: true,
      pagamentos_motoboys: true,
    }
  }
  if (papel === "juridico") {
    return { dashboard: true, dashboard_calendario_producao: true, juridico: true }
  }
  return { dashboard: true, dashboard_calendario_producao: true }
}

export async function carregarPermissoes(user: User): Promise<Permissoes> {
  const supabase = createClient()
  const papel: Papel = getPapel(user)

  const [{ data: padrao, error: padraoError }, { data: individuais, error: individualError }] =
    await Promise.all([
      supabase.from("perfis_permissoes").select("modulo, pode_visualizar").eq("papel", papel),
      supabase.from("usuarios_permissoes").select("modulo, pode_visualizar").eq("usuario_id", user.id),
    ])

  if (padraoError || individualError) return fallbackPorPapel(papel)

  const resultado: Permissoes = {}
  for (const item of padrao ?? []) resultado[item.modulo as Modulo] = item.pode_visualizar
  for (const item of individuais ?? []) resultado[item.modulo as Modulo] = item.pode_visualizar

  if (papel !== "admin" && papel !== "socio") {
    resultado.escala = false
    resultado.kanban = false
  }

  return resultado
}
