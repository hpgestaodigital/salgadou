import { Suspense } from "react"
import { ProducaoView } from "@/components/producao-view"
import { ProductionCalendarEnhancer } from "@/components/production-calendar-enhancer"

export default function ProducaoPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando Produção...</p>}>
      <ProductionCalendarEnhancer />
      <ProducaoView />
    </Suspense>
  )
}
