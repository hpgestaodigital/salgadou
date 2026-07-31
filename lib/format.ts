export function formatBRL(value: number | null | undefined): string {
  const v = typeof value === "number" ? value : 0
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("T")[0].split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Retorna a segunda-feira da semana de uma data (ISO)
export function mondayOf(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00")
  const day = d.getDay() // 0 dom ... 6 sab
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T12:00:00")
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function weekLabel(mondayISO: string): string {
  const start = formatDate(mondayISO)
  const end = formatDate(addDaysISO(mondayISO, 6))
  return `${start} — ${end}`
}
