"use client"

import Link from "next/link"
import { useEffect } from "react"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

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

  return (
    <Card className="mb-5 border-primary/25 bg-primary/[0.035]">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Receitas e fichas técnicas agora ficam em uma seção própria.</p>
          <p className="text-sm text-muted-foreground">Cadastre salgados, massas, recheios e molhos sem misturar com o planejamento diário.</p>
        </div>
        <Button asChild><Link href="/receitas"><BookOpen className="size-4" />Abrir Receitas</Link></Button>
      </CardContent>
    </Card>
  )
}
