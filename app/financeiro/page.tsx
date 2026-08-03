import { FinanceiroView } from "@/components/financeiro-view"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"

export default function FinanceiroPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        title="Leitor de Planilha"
        description="Transforme as planilhas recebidas do financeiro em uma leitura mais simples, visual e organizada."
      />

      <Card className="border-sky-500/30 bg-sky-500/5">
        <CardContent className="space-y-2 py-5 text-sm leading-relaxed">
          <p className="font-semibold text-sky-300">Esta seção é somente um leitor das planilhas enviadas pelo financeiro.</p>
          <p className="text-muted-foreground">
            Os indicadores abaixo refletem exclusivamente os arquivos importados aqui, para facilitar conferências e análises. Esses dados não alimentam outros módulos e não devem ser considerados o financeiro nativo do ERP.
          </p>
          <p className="text-muted-foreground">
            A futura seção financeira própria do ERP será construída separadamente, usando apenas movimentações geradas dentro do sistema.
          </p>
        </CardContent>
      </Card>

      <div className="[&>div>div:first-child]:hidden">
        <FinanceiroView />
      </div>
    </div>
  )
}
