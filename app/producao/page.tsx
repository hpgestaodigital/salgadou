import { Suspense } from "react"
import { ProducaoView } from "@/components/producao-view"
import { ProductionCalendarEnhancer } from "@/components/production-calendar-enhancer"
import { ProductionFreezingControl } from "@/components/production-freezing-control"

export default function ProducaoPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando Produção...</p>}>
      <ProductionCalendarEnhancer />
      <ProductionFreezingControl />
      <ProducaoView />
    </Suspense>
  )
}
