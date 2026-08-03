"use client"

import { useEffect } from "react"
import { toast } from "sonner"

export function ProductionCalendarEnhancer() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      const button = target?.closest("button")
      if (!button || !button.textContent?.includes("Programar neste dia")) return

      window.requestAnimationFrame(() => {
        const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, [data-slot='card-title']"))
        const heading = headings.find((item) => item.textContent?.trim() === "Programar produção")
        const card = heading?.closest<HTMLElement>("[data-slot='card'], .rounded-xl") ?? heading?.parentElement
        const dateInput = card?.querySelector<HTMLInputElement>('input[type="date"]')

        if (!card) {
          toast.error("Não foi possível localizar o formulário de programação.")
          return
        }

        card.scrollIntoView({ behavior: "smooth", block: "center" })
        card.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background")
        dateInput?.focus({ preventScroll: true })
        toast.success("Data selecionada. Complete os dados da produção.")

        window.setTimeout(() => {
          card.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background")
        }, 2200)
      })
    }

    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [])

  return null
}
