export type Papel = "admin" | "financeiro" | "socio" | "colaborador" | "juridico"

export const ADMIN_EMAIL = "admin@admin.com"

export const PAPEL_LABEL: Record<Papel, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
  socio: "Sócio",
  colaborador: "Colaborador",
  juridico: "Jurídico",
}

type MetadataUsuario = {
  nome?: string
  role?: string
}

type UsuarioLike = {
  email?: string | null
  user_metadata?: MetadataUsuario | null
  app_metadata?: (Record<string, unknown> & { role?: string }) | null
} | null

export function getPapel(user: UsuarioLike): Papel {
  if (!user) return "colaborador"
  if (user.email === ADMIN_EMAIL) return "admin"
  const role = user.app_metadata?.role
  if (role === "admin" || role === "financeiro" || role === "socio" || role === "colaborador" || role === "juridico") return role
  return "colaborador"
}

export function isAdmin(user: UsuarioLike): boolean {
  return ["admin", "financeiro"].includes(getPapel(user))
}

export function getNome(user: UsuarioLike): string {
  if (!user) return ""
  return user.user_metadata?.nome || user.email || ""
}
