"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

type ProdutoUnidade = { id: string; unidade: string }

const UNIDADES: Record<string, string> = {
  un: "unidades",
  kg: "kg",
  g: "g",
  l: "litros",
  ml: "ml",
  pct: "pacotes",
  cx: "caixas",
}

export function ProductionCalendarEnhancer() {
  useEffect(() => {
    const supabase = createClient()
    let produtos = new Map<string, string>()
    let observer: MutationObserver | null = null

    function localizarFormulario() {
      const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, [data-slot='card-title']"))
      const heading = headings.find((item) => item.textContent?.trim() === "Programar produção")
      const card = heading?.closest<HTMLElement>("[data-slot='card'], .rounded-xl") ?? heading?.parentElement
      if (!card) return null
      const dateInput = card.querySelector<HTMLInputElement>('input[type="date"]')
      const selects = Array.from(card.querySelectorAll<HTMLSelectElement>("select"))
      const produtoSelect = selects.find((select) => Array.from(select.options).some((option) => option.textContent?.trim() === "Selecione"))
      const numberInputs = Array.from(card.querySelectorAll<HTMLInputElement>('input[type="number"]'))
      const quantidadeInput = numberInputs[0]
      return { card, dateInput, produtoSelect, quantidadeInput }
    }

    function aplicarMelhorias() {
      const tabEstoque = Array.from(document.querySelectorAll<HTMLElement>("button, [role='tab']"))
        .find((item) => item.textContent?.trim() === "Itens em estoque")
      if (tabEstoque) tabEstoque.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes("Itens em estoque")) node.textContent = "Estoque de insumos"
      })

      const formulario = localizarFormulario()
      if (!formulario) return
      const { card, produtoSelect, quantidadeInput } = formulario

      card.classList.add("scroll-mt-24")
      const grid = card.querySelector<HTMLElement>("[data-slot='card-content'] > div.grid")
      if (grid) {
        grid.classList.remove("sm:grid-cols-3")
        grid.classList.add("md:grid-cols-[minmax(170px,0.8fr)_minmax(220px,1.2fr)_minmax(170px,0.8fr)]")
      }

      if (!produtoSelect || !quantidadeInput) return
      quantidadeInput.min = "0.0001"
      quantidadeInput.inputMode = "decimal"
      quantidadeInput.placeholder = "Informe a quantidade"

      let unidade = quantidadeInput.parentElement?.querySelector<HTMLElement>("[data-production-unit]")
      if (!unidade) {
        unidade = document.createElement("p")
        unidade.dataset.productionUnit = "true"
        unidade.className = "mt-1 text-xs font-medium text-primary"
        quantidadeInput.parentElement?.appendChild(unidade)
      }

      const atualizarUnidade = () => {
        const codigo = produtos.get(produtoSelect.value) || ""
        const rotulo = UNIDADES[codigo] || codigo
        unidade!.textContent = rotulo ? `Quantidade planejada em ${rotulo}.` : "Selecione um produto para ver a unidade."
        quantidadeInput.step = codigo === "un" || codigo === "pct" || codigo === "cx" ? "1" : "0.001"
        quantidadeInput.setAttribute("aria-describedby", "production-unit-help")
        unidade!.id = "production-unit-help"
      }

      if (produtoSelect.dataset.unitEnhanced !== "true") {
        produtoSelect.dataset.unitEnhanced = "true"
        produtoSelect.addEventListener("change", atualizarUnidade)
      }
      atualizarUnidade()
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      const button = target?.closest("button")
      if (!button || !button.textContent?.includes("Programar neste dia")) return

      window.requestAnimationFrame(() => {
        const formulario = localizarFormulario()
        if (!formulario) {
          toast.error("Não foi possível localizar o formulário de programação.")
          return
        }

        formulario.card.scrollIntoView({ behavior: "smooth", block: "center" })
        formulario.card.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background")
        formulario.dateInput?.focus({ preventScroll: true })
        toast.success("Data selecionada. Escolha o produto e informe a quantidade na unidade indicada.")

        window.setTimeout(() => {
          formulario.card.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background")
        }, 2200)
      })
    }

    async function iniciar() {
      const { data } = await supabase.from("producao_produtos").select("id, unidade").eq("ativo", true)
      produtos = new Map(((data ?? []) as ProdutoUnidade[]).map((produto) => [produto.id, produto.unidade]))
      aplicarMelhorias()
      observer = new MutationObserver(() => aplicarMelhorias())
      observer.observe(document.body, { childList: true, subtree: true })
    }

    void iniciar()
    document.addEventListener("click", handleClick, true)
    return () => {
      observer?.disconnect()
      document.removeEventListener("click", handleClick, true)
    }
  }, [])

  return null
}
