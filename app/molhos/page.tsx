import { ProductionModuleHub } from "@/components/production-module-hub"
import { PageHeader } from "@/components/page-header"
import { SauceStockControl } from "@/components/sauce-stock-control"

export default function MolhosPage() {
  return (
    <div className="space-y-8">
      <ProductionModuleHub />
      <div>
        <PageHeader
          title="Molhos"
          description="Produção diária, estoque de bisnagas, perdas, vendas e histórico de movimentações."
        />
        <SauceStockControl />
      </div>
    </div>
  )
}
