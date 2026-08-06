"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

function dataPtBrParaISO(valor: string) {
  const partes = valor.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!partes) return null
  return `${partes[3]}-${partes[2]}-${partes[1]}`
}

function hojeISO() {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, "0")
  const dia = String(agora.getDate()).padStart(2, "0")
  return `${ano}-${mes}-${dia}`
}

export function InterfaceLabelOverrides() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname.startsWith("/pagamentos-fornecedores")) return

    function atualizarStatus() {
      const hoje = hojeISO()
      document.querySelectorAll("tbody tr").forEach((linha) => {
        const celulas = linha.querySelectorAll("td")
        if (celulas.length < 5) return
        const status = celulas[4]
        const textoAtual = status.textContent?.trim() ?? ""
        if (textoAtual.startsWith("Pago")) return

        const vencimento = dataPtBrParaISO(celulas[2].textContent ?? "")
        if (!vencimento) return

        const badge = status.querySelector("[data-slot='badge']") ?? status.firstElementChild
        if (!badge) return
        badge.textContent = vencimento < hoje ? "Vencido" : vencimento === hoje ? "⚠️ Vence hoje" : "A vencer"
      })
    }

    atualizarStatus()
    const observer = new MutationObserver(atualizarStatus)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [pathname])

  return (
    <style>{`
      a[href="/financeiro"] > span {
        font-size: 0;
      }

      a[href="/financeiro"] > span::after {
        content: "Leitor de Planilha";
        font-size: 0.875rem;
      }

      [role="dialog"] a[href^="/pagamentos-"] {
        min-width: 0;
        max-width: 100%;
      }

      [role="dialog"] a[href^="/pagamentos-"] [data-slot="button"] {
        width: 100%;
        max-width: 100%;
        min-height: 2.25rem;
        height: auto;
        padding: 0.55rem 0.7rem;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: normal;
        text-align: center;
        line-height: 1.2;
        font-size: 0.75rem;
      }

      @media (max-width: 700px) {
        [role="dialog"] a[href^="/pagamentos-"] [data-slot="button"] {
          font-size: 0.7rem;
        }
      }
    `}</style>
  )
}
