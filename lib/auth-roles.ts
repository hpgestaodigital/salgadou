export type Papel = "admin" | "socio" | "colaborador" | "juridico"

export const ADMIN_EMAIL = "admin@admin.com"

export const PAPEL_LABEL: Record<Papel, string> = {
  admin: "Administrador",
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
  if (role === "admin" || role === "socio" || role === "colaborador" || role === "juridico") return role
  return "colaborador"
}

export function isAdmin(user: UsuarioLike): boolean {
  return getPapel(user) === "admin"
}

export function getNome(user: UsuarioLike): string {
  if (!user) return ""
  return user.user_metadata?.nome || user.email || ""
}
