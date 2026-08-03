import { ProductionModuleHub } from "@/components/production-module-hub"
import { TechnicalSheetsManager } from "@/components/technical-sheets-manager"
import { PreparosIntermediarios } from "@/components/preparos-intermediarios"
import { SauceStockControl } from "@/components/sauce-stock-control"

export default function ReceitasPage() {
  return (
    <div className="space-y-8">
      <ProductionModuleHub />
      <TechnicalSheetsManager />
      <PreparosIntermediarios />
      <SauceStockControl />
    </div>
  )
}
