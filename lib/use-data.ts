"use client"

import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"

export function useTable<T>(table: string, orderBy?: { column: string; ascending?: boolean }) {
  const supabase = createClient()
  const key = `table:${table}:${orderBy?.column ?? ""}:${orderBy?.ascending ?? ""}`

  const { data, error, isLoading, mutate } = useSWR<T[]>(key, async () => {
    if (table === "colaboradores") {
      const { data, error } = await supabase.rpc("listar_colaboradores")
      if (error) throw error
      const rows = [...((data ?? []) as T[])]
      if (orderBy) {
        const column = orderBy.column as keyof T
        const direction = orderBy.ascending ?? true
        rows.sort((a, b) => {
          const left = String(a[column] ?? "")
          const right = String(b[column] ?? "")
          return direction ? left.localeCompare(right, "pt-BR") : right.localeCompare(left, "pt-BR")
        })
      }
      return rows
    }

    let query = supabase.from(table).select("*")
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true })
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as T[]
  })

  return { data: data ?? [], error, isLoading, mutate }
}
