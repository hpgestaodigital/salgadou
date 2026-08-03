import { ReceitasView } from "@/components/receitas-view"
import { PreparosIntermediarios } from "@/components/preparos-intermediarios"

export default function ReceitasPage() {
  return (
    <div className="space-y-8">
      <ReceitasView />
      <PreparosIntermediarios />
    </div>
  )
}
