import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const ROTAS_PUBLICAS = ["/auth", "/api/auth"]

const ROTAS_MODULOS = [
  { prefixo: "/escala", modulo: "escala" },
  { prefixo: "/kanban", modulo: "kanban" },
  { prefixo: "/reunioes", modulo: "reunioes" },
  { prefixo: "/juridico", modulo: "juridico" },
  { prefixo: "/financeiro", modulo: "financeiro" },
  { prefixo: "/metas", modulo: "metas" },
  { prefixo: "/mercado", modulo: "producao_compras" },
  { prefixo: "/historico", modulo: "historico" },
  { prefixo: "/pagamentos-fornecedores", modulo: "pagamentos_fornecedores" },
  { prefixo: "/pagamentos-motoboys", modulo: "pagamentos_motoboys" },
  { prefixo: "/cadastros", modulo: "cadastros" },
  { prefixo: "/usuarios", modulo: "usuarios" },
  { prefixo: "/configuracoes", modulo: "configuracoes" },
] as const

const ROTAS_PRODUCAO = [
  "/producao",
  "/receitas",
  "/molhos",
  "/estoque-salgadinhos",
  "/integracoes",
] as const

const DESTINOS = [
  ["dashboard", "/"], ["escala", "/escala"], ["kanban", "/kanban"],
  ["reunioes", "/reunioes"], ["producao_planejamento", "/producao"],
  ["producao_estoque", "/producao?tab=estoque"], ["producao_compras", "/producao?tab=compras"],
  ["juridico", "/juridico"], ["historico", "/historico"],
  ["financeiro", "/financeiro"],
  ["metas", "/metas"],
  ["pagamentos_fornecedores", "/pagamentos-fornecedores"],
  ["pagamentos_motoboys", "/pagamentos-motoboys"], ["cadastros", "/cadastros"],
  ["usuarios", "/usuarios"], ["configuracoes", "/configuracoes"],
] as const

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl
  const rotaPublica = ROTAS_PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const rotaTrocarSenha = pathname === "/auth/trocar-senha"
  const deveTrocarSenha = user?.app_metadata?.must_change_password === true

  if (!user && !rotaPublica) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  if (user && pathname === "/auth/login") {
    const url = request.nextUrl.clone()
    url.pathname = deveTrocarSenha ? "/auth/trocar-senha" : "/"
    return NextResponse.redirect(url)
  }

  if (
    user &&
    deveTrocarSenha &&
    !rotaTrocarSenha &&
    !pathname.startsWith("/api/auth/trocar-senha")
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/trocar-senha"
    url.search = ""
    return NextResponse.redirect(url)
  }

  if (user && !deveTrocarSenha && rotaTrocarSenha) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  if (user && !rotaPublica && !pathname.startsWith("/api/")) {
    const papel = String(user.app_metadata?.role || "colaborador")
    const [{ data: padrao, error: padraoError }, { data: individuais, error: individuaisError }] =
      await Promise.all([
        supabase.from("perfis_permissoes").select("modulo, pode_visualizar").eq("papel", papel),
        supabase.from("usuarios_permissoes").select("modulo, pode_visualizar").eq("usuario_id", user.id),
      ])

    const permissoes: Record<string, boolean> = {}
    if (!padraoError && !individuaisError) {
      for (const item of padrao ?? []) permissoes[item.modulo] = item.pode_visualizar
      for (const item of individuais ?? []) permissoes[item.modulo] = item.pode_visualizar
    } else {
      const todos = papel === "admin" || papel === "financeiro" || papel === "socio"
      for (const [modulo] of DESTINOS) permissoes[modulo] = todos
      if (papel === "juridico") permissoes.juridico = true
      if (papel === "colaborador") {
        for (const modulo of ["dashboard", "escala", "kanban"]) permissoes[modulo] = true
      }
    }

    if (papel === "colaborador") {
      for (const modulo of ["dashboard", "escala", "kanban"]) permissoes[modulo] = true
    }

    if (pathname.startsWith("/demonstracao") && papel !== "admin") {
      const destino = DESTINOS.find(([modulo]) => permissoes[modulo])?.[1] || "/auth/sem-acesso"
      const url = request.nextUrl.clone()
      const [novoPath, query] = destino.split("?")
      url.pathname = novoPath
      url.search = query ? `?${query}` : ""
      return NextResponse.redirect(url)
    }

    let moduloAtual: string | null = pathname === "/" ? "dashboard" : null
    if (ROTAS_PRODUCAO.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`))) {
      moduloAtual = ["producao_compras", "producao_estoque", "producao_planejamento"]
        .some((modulo) => permissoes[modulo]) ? "producao" : "producao_bloqueada"
    } else {
      moduloAtual = ROTAS_MODULOS.find((item) => pathname.startsWith(item.prefixo))?.modulo ?? moduloAtual
    }

    const permitido = moduloAtual === "producao" || (moduloAtual ? Boolean(permissoes[moduloAtual]) : true)
    if (!permitido) {
      const destino = DESTINOS.find(([modulo]) => permissoes[modulo])?.[1] || "/auth/sem-acesso"
      const url = request.nextUrl.clone()
      const [novoPath, query] = destino.split("?")
      url.pathname = novoPath
      url.search = query ? `?${query}` : ""
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
