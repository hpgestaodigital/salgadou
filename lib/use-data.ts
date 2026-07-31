"use client"

import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"

export function useTable<T>(table: string, orderBy?: { column: string; ascending?: boolean }) {
  const supabase = createClient()
  const key = `table:${table}:${orderBy?.column ?? ""}:${orderBy?.ascending ?? ""}`

  const { data, error, isLoading, mutate } = useSWR<T[]>(key, async () => {
    let query = supabase.from(table).select("*")
    if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true })
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as T[]
  })

  return { data: data ?? [], error, isLoading, mutate }
}
