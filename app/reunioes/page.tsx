"use client"

import { useLayoutEffect } from "react"
import { ReunioesView } from "@/components/reunioes-view"

export default function ReunioesPage() {
  useLayoutEffect(() => {
    const botaoRegistrarAta = Array.from(document.querySelectorAll("button")).find(
      (botao) => botao.textContent?.trim() === "Registrar ata",
    )

    botaoRegistrarAta?.remove()
  }, [])

  return <ReunioesView />
}
