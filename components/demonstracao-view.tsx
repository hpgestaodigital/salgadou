"use client"

import { useState } from "react"
import { CalendarDays, CheckCircle2, ClipboardList, Eye, Factory, Landmark, Scale, ShieldCheck, Users } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type PerfilDemo = "admin" | "socio_financeiro" | "producao" | "juridico"

const PERFIS = {
  admin: { nome: "Administrador / Sócio operacional", descricao: "Visão ampla da operação, produção, equipe e pagamentos.", blocos: ["Meu trabalho", "Calendário da produção", "Financeiro", "Equipe ativa", "Pendências"] },
  socio_financeiro: { nome: "Sócio — painel personalizado", descricao: "É o mesmo perfil Sócio, com o dashboard configurado individualmente para acompanhar pagamentos e responsabilidades, sem o calendário de produção.", blocos: ["Meu trabalho", "Fornecedores", "Motoboys", "Contas vencidas", "Pendências dos sócios"] },
  producao: { nome: "Colaborador da produção", descricao: "Acompanha sua escala, pré-preparo, lotes e tarefas atribuídas.", blocos: ["Meu trabalho", "Calendário da produção", "Pré-preparo", "Escala semanal", "Kanban"] },
  juridico: { nome: "Responsável pelo Jurídico", descricao: "Acompanha demandas, validações dos sócios, contratos e assinaturas.", blocos: ["Meu trabalho", "Demandas jurídicas", "Contratos", "Validações", "Assinaturas pendentes"] },
} satisfies Record<PerfilDemo, { nome: string; descricao: string; blocos: string[] }>

export function DemonstracaoView() {
  const [perfil, setPerfil] = useState<PerfilDemo>("admin")
  const atual = PERFIS[perfil]
  return <div>
    <PageHeader title="Demonstração do ERP" description="Explore exemplos visuais sem criar usuários e sem gravar qualquer dado no sistema real." />
    <Card className="mb-5 border-primary/30 bg-primary/5"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-primary"><Eye className="size-4" /><p className="text-xs font-bold uppercase tracking-wider">Ambiente somente visual</p></div><p className="mt-2 font-semibold">Escolha uma visão para apresentar</p><p className="text-sm text-muted-foreground">Nada nesta página altera o Supabase, os usuários ou a operação.</p></div><Select value={perfil} onValueChange={(valor) => setPerfil(valor as PerfilDemo)}><SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Administrador / Sócio operacional</SelectItem><SelectItem value="socio_financeiro">Sócio — painel personalizado</SelectItem><SelectItem value="producao">Colaborador da produção</SelectItem><SelectItem value="juridico">Responsável jurídico</SelectItem></SelectContent></Select></CardContent></Card>
    <section className="rounded-2xl border bg-card p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><Badge variant="outline">DEMONSTRAÇÃO</Badge><h2 className="mt-3 font-heading text-2xl font-bold">{atual.nome}</h2><p className="mt-1 text-sm text-muted-foreground">{atual.descricao}</p></div><ShieldCheck className="size-8 text-primary" /></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DemoCard icon={ClipboardList} title="Meu trabalho" value={perfil === "juridico" ? "3 demandas" : "4 responsabilidades"} detail="Itens atribuídos diretamente a este perfil" />
        {perfil !== "socio_financeiro" && perfil !== "juridico" && <DemoCard icon={CalendarDays} title="Agenda da semana" value="2 compromissos" detail="Calendário e escala somente para acompanhamento" />}
        {(perfil === "admin" || perfil === "socio_financeiro") && <DemoCard icon={Landmark} title="Resumo financeiro" value="R$ 8.420,00" detail="Pagamentos, vencimentos e pendências" />}
        {(perfil === "admin" || perfil === "producao") && <DemoCard icon={Factory} title="Produção" value="3 lotes" detail="Pré-preparo, congelamento e empacotamento" />}
        {perfil === "juridico" && <DemoCard icon={Scale} title="Jurídico" value="2 validações" detail="Contratos aguardando análise dos sócios" />}
        {perfil === "admin" && <DemoCard icon={Users} title="Equipe ativa" value="8 pessoas" detail="Colaboradores, sócios e motoboys" />}
      </div>
      <div className="mt-6 rounded-xl border bg-muted/20 p-4"><p className="text-sm font-semibold">Blocos habilitados neste exemplo</p><div className="mt-3 flex flex-wrap gap-2">{atual.blocos.map((bloco) => <Badge key={bloco} variant="secondary"><CheckCircle2 className="mr-1 size-3" />{bloco}</Badge>)}</div></div>
    </section>
  </div>
}

function DemoCard({ icon: Icon, title, value, detail }: { icon: typeof ClipboardList; title: string; value: string; detail: string }) {
  return <Card><CardHeader className="pb-2"><div className="flex items-center justify-between gap-3"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">{title}</CardTitle><Icon className="size-5 text-primary" /></div></CardHeader><CardContent><p className="font-heading text-2xl font-bold">{value}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></CardContent></Card>
}
