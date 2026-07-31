type SupabaseLikeError = {
  code?: string
  message?: string
  details?: string
}

export function mensagemErroSupabase(error: unknown, fallback = "Não foi possível salvar.") {
  const erro = (error ?? {}) as SupabaseLikeError
  const texto = `${erro.message ?? ""} ${erro.details ?? ""}`.toLowerCase()

  if (
    erro.code === "PGRST204" ||
    erro.code === "PGRST205" ||
    erro.code === "42P01" ||
    texto.includes("could not find the table") ||
    texto.includes("could not find the") && texto.includes("column")
  ) {
    return "O banco do ERP ainda não foi preparado. Aplique as migrações do Supabase e tente novamente."
  }
  if (erro.code === "42501" || texto.includes("row-level security") || texto.includes("permission denied")) {
    return "Seu usuário não tem permissão para salvar. Entre novamente e verifique as políticas RLS do Supabase."
  }
  if (texto.includes("jwt") || texto.includes("not authenticated")) {
    return "Sua sessão expirou. Entre novamente para salvar."
  }
  return fallback
}
