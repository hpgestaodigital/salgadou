export type Colaborador = {
  id: string
  nome: string
  whatsapp: string | null
  tipo: string | null
  valor_diaria: number | null
  funcao: string | null
  ativo: boolean
  created_at: string
}

export type Motoboy = {
  id: string
  nome: string
  pix: string | null
  whatsapp: string | null
  valor_diaria: number | null
  ativo: boolean
  created_at: string
}

export type Fornecedor = {
  id: string
  nome: string
  whatsapp: string | null
  observacao: string | null
  ativo: boolean
  created_at: string
}

export type Escala = {
  id: string
  semana_inicio: string
  colaborador_id: string
  seg: string | null
  ter: string | null
  qua: string | null
  qui: string | null
  sex: string | null
  sab: string | null
  dom: string | null
  observacoes: string | null
  created_at: string
}

export type PagamentoFornecedor = {
  id: string
  pedido: string | null
  vencimento: string
  fornecedor: string
  valor: number
  observacao: string | null
  pago_em: string | null
  comprovante: string | null
  responsavel: string | null
  created_at: string
}

export type PagamentoMotoboy = {
  id: string
  data: string
  motoboy_id: string | null
  motoboy_nome: string | null
  numero_entregas: number | null
  valor_taxas: number | null
  valor_diaria: number | null
  total: number | null
  pix: string | null
  pago_em: string | null
  observacao: string | null
  created_at: string
}

export type Configuracao = {
  chave: string
  valor: string | null
  updated_at: string
}

export const DIAS = [
  { key: "seg", label: "Seg" },
  { key: "ter", label: "Ter" },
  { key: "qua", label: "Qua" },
  { key: "qui", label: "Qui" },
  { key: "sex", label: "Sex" },
  { key: "sab", label: "Sáb" },
  { key: "dom", label: "Dom" },
] as const
