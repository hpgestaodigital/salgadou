"use client"

import { useEffect } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

type ProdutoUnidade = { id: string; unidade: string }

const UNIDADES: Record<string, string> = {
  un: "unidades",
  kg: "quilogramas (kg)",
  g: "gramas (g)",
  l: "litros (L)",
  ml: "mililitros (ml)",
  pct: "pacotes",
  cx: "caixas",
}

export function ProductionCalendarEnhancer() {
  useEffect(() => {
    const supabase = createClient()
    let produtos = new Map<string, string>()
    let observer: MutationObserver | null = null
    let frame: number | null = null
    let stopTimer: number | null = null

    function localizarCard(titulo: string) {
      const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, [data-slot='card-title']"))
      const heading = headings.find((item) => item.textContent?.trim() === titulo)
      return heading?.closest<HTMLElement>("[data-slot='card'], .rounded-xl") ?? heading?.parentElement ?? null
    }

    function localizarFormulario() {
      const card = localizarCard("Programar produção")
      if (!card) return null
      const dateInput = card.querySelector<HTMLInputElement>('input[type="date"]')
      const selects = Array.from(card.querySelectorAll<HTMLSelectElement>("select"))
      const produtoSelect = selects.find((select) => Array.from(select.options).some((option) => option.textContent?.trim() === "Selecione"))
      const quantidadeInput = card.querySelector<HTMLInputElement>('input[type="number"]')
      return { card, dateInput, produtoSelect, quantidadeInput }
    }

    function simplificarCadastroInsumo() {
      const card = localizarCard("Novo insumo")
      if (!card || card.dataset.cleaned === "true") return

      const content = card.querySelector<HTMLElement>("[data-slot='card-content']")
      const inputs = Array.from(card.querySelectorAll<HTMLInputElement>("input"))
      const select = card.querySelector<HTMLSelectElement>("select")
      const nome = inputs.find((input) => input.type !== "number")
      const numericos = inputs.filter((input) => input.type === "number")

      numericos.forEach((input) => {
        input.value = ""
        input.closest<HTMLElement>("div")?.classList.add("hidden")
        input.classList.add("hidden")
        input.setAttribute("aria-hidden", "true")
        input.tabIndex = -1
      })

      if (select) {
        const opcoesPermitidas = new Set(["kg", "g", "l", "ml", "un"])
        Array.from(select.options).forEach((option) => {
          option.textContent = UNIDADES[option.value] || option.value
          option.hidden = !opcoesPermitidas.has(option.value)
          option.disabled = !opcoesPermitidas.has(option.value)
        })
        if (!opcoesPermitidas.has(select.value)) select.value = "kg"
        select.setAttribute("aria-label", "Unidade usada para controlar o estoque")
      }

      nome?.setAttribute("placeholder", "Nome do insumo, ex.: Farinha de trigo")
      if (content) {
        content.classList.remove("sm:grid-cols-6")
        content.classList.add("sm:grid-cols-[minmax(240px,1fr)_minmax(180px,240px)_auto]")
        const ajuda = document.createElement("p")
        ajuda.className = "text-xs text-muted-foreground sm:col-span-3"
        ajuda.dataset.stockHelp = "true"
        ajuda.textContent = "Cadastre apenas o nome e a unidade de controle. O saldo entra depois pelo botão de movimentação, mantendo o histórico correto."
        content.appendChild(ajuda)
      }

      card.dataset.cleaned = "true"
    }

    function esconderBlocosLegados() {
      ;["Caixas congeladas por produto", "Porções empacotadas por produto"].forEach((titulo) => {
        const card = localizarCard(titulo)
        if (card) card.classList.add("hidden")
      })
    }

    function aplicarMelhorias() {
      const tabEstoque = Array.from(document.querySelectorAll<HTMLElement>("button, [role='tab']"))
        .find((item) => ["Itens em estoque", "Estoque de insumos"].includes(item.textContent?.trim() || ""))
      if (tabEstoque) tabEstoque.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes("Itens em estoque")) node.textContent = "Estoque de insumos"
      })

      simplificarCadastroInsumo()
      esconderBlocosLegados()

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

      const codigo = produtos.get(produtoSelect.value) || ""
      const rotulo = UNIDADES[codigo] || codigo
      unidade.textContent = rotulo ? `Quantidade planejada em ${rotulo}.` : "Selecione um produto para ver a unidade."
      quantidadeInput.step = codigo === "un" || codigo === "pct" || codigo === "cx" ? "1" : "0.001"
      quantidadeInput.setAttribute("aria-describedby", "production-unit-help")
      unidade.id = "production-unit-help"
    }

    function agendarMelhorias() {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        aplicarMelhorias()
      })
    }

    function handleInteraction(event: Event) {
      const target = event.target as HTMLElement | null
      const button = target?.closest("button")
      if (button?.textContent?.includes("Programar neste dia")) {
        window.requestAnimationFrame(() => {
          aplicarMelhorias()
          const formulario = localizarFormulario()
          if (!formulario) {
            toast.error("Não foi possível localizar o formulário de programação.")
            return
          }
          formulario.card.scrollIntoView({ behavior: "smooth", block: "center" })
          formulario.card.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background")
          formulario.dateInput?.focus({ preventScroll: true })
          toast.success("Data selecionada. Escolha o produto e informe a quantidade na unidade indicada.")
          window.setTimeout(() => formulario.card.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background"), 2200)
        })
      } else {
        agendarMelhorias()
      }
    }

    async function iniciar() {
      const { data } = await supabase.from("producao_produtos").select("id, unidade").eq("ativo", true)
      produtos = new Map(((data ?? []) as ProdutoUnidade[]).map((produto) => [produto.id, produto.unidade]))
      aplicarMelhorias()

      const raiz = document.querySelector("main") ?? document.body
      observer = new MutationObserver(agendarMelhorias)
      observer.observe(raiz, { childList: true, subtree: true })
      stopTimer = window.setTimeout(() => {
        observer?.disconnect()
        observer = null
      }, 8000)
    }

    void iniciar()
    document.addEventListener("click", handleInteraction, true)
    document.addEventListener("change", handleInteraction, true)

    return () => {
      observer?.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
      if (stopTimer !== null) window.clearTimeout(stopTimer)
      document.removeEventListener("click", handleInteraction, true)
      document.removeEventListener("change", handleInteraction, true)
    }
  }, [])

  return null
}
