export type Colaborador = {
  id: string
  nome: string
  whatsapp: string | null
  tipo: string | null
  valor_diaria: number | null
  modalidade_pagamento?: "pro_labore" | "diaria" | "contrato" | null
  periodicidade_pagamento?: "por_dia" | "por_servico" | "semanal" | "quinzenal" | "mensal" | null
  valor_pagamento?: number | null
  observacoes_contrato?: string | null
  funcao: string | null
  ativo: boolean
  notificacoes_whatsapp?: boolean | null
  created_at: string
}

export const TIPOS_COLABORADOR = [
  "Diarista / Freelancer",
  "Prestador de serviço · Por serviço",
  "Prestador de serviço · Semanal",
  "Prestador de serviço · Quinzenal",
  "Prestador de serviço · Mensal",
] as const

export function isSocio(colaborador: Colaborador) {
  return colaborador.tipo === "Sócio"
}

export function labelValorColaborador(tipo: string | null) {
  if (tipo === "Sócio") return "Pró-labore"
  if (tipo?.startsWith("Diarista")) return "Valor da diária"
  return "Pagamento fixo"
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
  anexo_url?: string | null
  anexo_path?: string | null
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
  responsavel?: string | null
  anexo_url?: string | null
  anexo_path?: string | null
  rastreio_anexo_url?: string | null
  rastreio_anexo_path?: string | null
  created_at: string
}

export type EntregaMotoboy = {
  id: string
  pagamento_id: string
  identificador?: string
  numero_entrega?: string
  bairro?: string
  valor_recebido?: number | null
  comissao?: number | null
  created_at?: string
}

export type Configuracao = {
  chave: string
  valor: string | null
  updated_at: string
}

export type MercadoCompra = {
  id: string
  fornecedor_id: string | null
  data_compra: string
  valor_total: number
  nota_path: string | null
  observacoes: string | null
  criado_por: string | null
  created_at: string
  fornecedor?: { nome: string } | null
  itens?: MercadoCompraItem[]
}

export type MercadoCompraItem = {
  id: string
  compra_id: string
  insumo_id: string
  quantidade_comprada: number
  preco_unitario: number
  preco_total: number
  insumo?: { nome: string; unidade: string } | null
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
