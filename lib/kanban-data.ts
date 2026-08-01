export type ContextoKanban = "socios" | "colaboradores"
export type StatusKanban = "nao_realizado" | "a_fazer" | "em_andamento" | "concluido"

export type TarefaKanban = {
  id: string
  titulo: string
  descricao: string | null
  contexto: ContextoKanban
  responsavel_id: string
  responsavel_nome: string
  status: StatusKanban
  prazo: string | null
  created_at: string
}

export type AcaoAuditoria = {
  id: number
  tabela: string
  registro_id: string | null
  registro_titulo: string | null
  acao: "criou" | "alterou" | "excluiu"
  usuario_id: string
  usuario_nome: string
  usuario_email: string | null
  ocorrido_em: string
}
