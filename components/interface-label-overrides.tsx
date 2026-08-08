export function InterfaceLabelOverrides() {
  return (
    <style>{`
      a[href="/financeiro"] > span {
        font-size: 0;
      }

      a[href="/financeiro"] > span::after {
        content: "Leitor de Planilha";
        font-size: 0.875rem;
      }

      a[href="/pagamentos-fornecedores"] > span {
        font-size: 0;
      }

      a[href="/pagamentos-fornecedores"] > span::after {
        content: "Fornec. e outras contas";
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
