export type TipoPlanilha = "fluxo_caixa" | "gastos"

export type LancamentoPlanilha = {
  chave_origem: string; origem: TipoPlanilha; tipo: "entrada" | "saida"; competencia: string
  data_lancamento: string | null; categoria: string; descricao: string; valor: number
  quantidade: number | null; valor_unitario: number | null; pedidos: number | null
  aba_origem: string; linha_origem: number; observacoes: string | null
}

export type PreviaPlanilha = { tipo: TipoPlanilha; arquivo: File; abas: string[]; lancamentos: LancamentoPlanilha[]; ignoradas: number }

const MESES: Record<string, number> = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
}

function texto(valor: unknown): string {
  if (valor == null) return ""
  if (typeof valor === "object") {
    const item = valor as { result?: unknown; text?: string; richText?: Array<{ text?: string }> }
    if (item.result != null) return texto(item.result)
    if (item.text) return item.text.trim()
    if (item.richText) return item.richText.map((parte) => parte.text || "").join("").trim()
  }
  return String(valor).trim()
}

function numero(valor: unknown): number | null {
  if (typeof valor === "object" && valor != null && "result" in valor) return numero((valor as { result?: unknown }).result)
  if (typeof valor === "number" && Number.isFinite(valor)) return valor
  const limpo = texto(valor).replace(/R\$\s*/gi, "").replace(/\s/g, "")
  if (!limpo || limpo.startsWith("#")) return null
  const convertido = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo)
  return Number.isFinite(convertido) ? convertido : null
}

function semAcento(valor: string) { return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() }
function anoDoArquivo(nome: string) { return Number(nome.match(/20\d{2}/)?.[0] || new Date().getFullYear()) }
function competencia(ano: number, mes: number) { return `${ano}-${String(mes).padStart(2, "0")}-01` }

function dataISO(valor: unknown, ano: number, mes: number, diaAlternativo?: number): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return [valor.getFullYear(), String(valor.getMonth() + 1).padStart(2, "0"), String(valor.getDate()).padStart(2, "0")].join("-")
  if (typeof valor === "number" && valor > 30000) return new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000).toISOString().slice(0, 10)
  if (diaAlternativo && diaAlternativo >= 1 && diaAlternativo <= 31) return `${ano}-${String(mes).padStart(2, "0")}-${String(diaAlternativo).padStart(2, "0")}`
  return null
}

function valorCelula(aba: import("exceljs").Worksheet, linha: number, coluna: number) { return aba.getRow(linha).getCell(coluna).value }
function chave(origem: TipoPlanilha, aba: string, secao: string, linha: number) { return `${origem}|${semAcento(aba)}|${secao}|${linha}` }

export async function lerPlanilhaFinanceira(arquivo: File, tipo: TipoPlanilha): Promise<PreviaPlanilha> {
  const modulo = await import("exceljs")
  const Workbook = modulo.Workbook || modulo.default.Workbook
  const workbook = new Workbook()
  await workbook.xlsx.load(await arquivo.arrayBuffer())
  const ano = anoDoArquivo(arquivo.name)
  const lancamentos: LancamentoPlanilha[] = []

  for (const aba of workbook.worksheets) {
    const mes = MESES[semAcento(aba.name)]
    if (!mes) continue
    const comp = competencia(ano, mes)
    if (tipo === "fluxo_caixa") {
      for (let linha = 2; linha <= Math.min(32, aba.rowCount); linha++) {
        const dia = numero(valorCelula(aba, linha, 1)); const vendas = numero(valorCelula(aba, linha, 4))
        if (!dia || vendas == null || vendas <= 0) continue
        const pedidos = numero(valorCelula(aba, linha, 3)); const balcao = numero(valorCelula(aba, linha, 6)) || 0; const sangria = numero(valorCelula(aba, linha, 7)) || 0
        lancamentos.push({ chave_origem: chave(tipo, aba.name, "vendas", linha), origem: tipo, tipo: "entrada", competencia: comp,
          data_lancamento: dataISO(null, ano, mes, dia), categoria: "Vendas", descricao: `Vendas de ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`,
          valor: Math.abs(vendas), quantidade: null, valor_unitario: null, pedidos: pedidos == null ? null : Math.round(pedidos), aba_origem: aba.name, linha_origem: linha,
          observacoes: balcao || sangria ? `Balcão: R$ ${balcao.toFixed(2)} · Sangria: R$ ${sangria.toFixed(2)}` : null })
      }
      let categoriaAtual = "Outras despesas"
      for (let linha = 2; linha <= aba.rowCount; linha++) {
        const descricao = texto(valorCelula(aba, linha, 10)); const valorBruto = valorCelula(aba, linha, 11); const valor = numero(valorBruto)
        if (/^(DESPESAS|CUSTOS)/.test(semAcento(descricao)) && semAcento(texto(valorBruto)) === "VALORES") { categoriaAtual = descricao; continue }
        if (!descricao || descricao.toUpperCase() === "TOTAL" || valor == null || valor <= 0) continue
        lancamentos.push({ chave_origem: chave(tipo, aba.name, "despesas", linha), origem: tipo, tipo: "saida", competencia: comp,
          data_lancamento: null, categoria: categoriaAtual, descricao, valor: Math.abs(valor), quantidade: null, valor_unitario: null, pedidos: null,
          aba_origem: aba.name, linha_origem: linha, observacoes: texto(valorCelula(aba, linha, 12)) || null })
      }
    } else {
      for (let linha = 2; linha <= aba.rowCount; linha++) {
        const descricao = texto(valorCelula(aba, linha, 1)); const valor = numero(valorCelula(aba, linha, 4))
        if (descricao && descricao.toUpperCase() !== "TOTAL" && valor != null && valor > 0) lancamentos.push({
          chave_origem: chave(tipo, aba.name, "ingredientes", linha), origem: tipo, tipo: "saida", competencia: comp,
          data_lancamento: dataISO(valorCelula(aba, linha, 6), ano, mes), categoria: "Ingredientes e materiais", descricao, valor: Math.abs(valor),
          quantidade: numero(valorCelula(aba, linha, 2)), valor_unitario: numero(valorCelula(aba, linha, 3)), pedidos: null,
          aba_origem: aba.name, linha_origem: linha, observacoes: texto(valorCelula(aba, linha, 5)) || null })
        for (const bloco of [{ d: 8, v: 9, s: "pagamentos", c: "Pagamentos gerais" }, { d: 12, v: 13, s: "motoboys", c: "Motoboys" }]) {
          const detalhe = texto(valorCelula(aba, linha, bloco.d)); const total = numero(valorCelula(aba, linha, bloco.v))
          if (!detalhe || detalhe.toUpperCase() === "TOTAL" || total == null || total === 0) continue
          lancamentos.push({ chave_origem: chave(tipo, aba.name, bloco.s, linha), origem: tipo, tipo: "saida", competencia: comp,
            data_lancamento: null, categoria: bloco.c, descricao: detalhe, valor: Math.abs(total), quantidade: null, valor_unitario: null,
            pedidos: null, aba_origem: aba.name, linha_origem: linha, observacoes: null })
        }
      }
    }
  }
  return { tipo, arquivo, abas: workbook.worksheets.map((aba) => aba.name), lancamentos, ignoradas: lancamentos.length ? 0 : 1 }
}
