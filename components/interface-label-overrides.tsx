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
    `}</style>
  )
}
