"use client"

import { useEffect } from "react"

export function ProductionRecipesEntry() {
  useEffect(() => {
    const ocultarCardAntigo = () => {
      const titulos = Array.from(document.querySelectorAll<HTMLElement>("[data-slot='card-title'], h2, h3"))
      const titulo = titulos.find((item) => item.textContent?.trim() === "Produtos e receitas")
      const card = titulo?.closest<HTMLElement>("[data-slot='card']")
      if (card) card.classList.add("hidden")
    }
    ocultarCardAntigo()
    const timer = window.setTimeout(ocultarCardAntigo, 800)
    return () => window.clearTimeout(timer)
  }, [])
  return null
}
