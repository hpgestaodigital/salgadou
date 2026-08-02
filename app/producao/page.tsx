import { Suspense } from "react"
import { ProducaoView } from "@/components/producao-view"

export default function ProducaoPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando Produção...</p>}>
      <ProducaoView />
    </Suspense>
  )
}
