import Link from "next/link"
import { Camera, FileText, Sparkles } from "lucide-react"
import { MercadoView } from "@/components/mercado-view"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Mercado | Salgadou Gestão",
  description: "Registre compras realizadas e acompanhe preços de insumos.",
}

export default function MercadoPage() {
  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.045] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-5" /></span>
            <div>
              <p className="font-semibold">Entrada automática por nota fiscal</p>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Fotografe a nota impressa ou envie PDF/XML. O sistema separa os itens para você conferir antes de atualizar o estoque.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild><Link href="/mercado/notas"><Camera className="size-4" />Ler uma nota</Link></Button>
            <Button asChild variant="outline" size="icon" title="Também aceita PDF e XML"><Link href="/mercado/notas"><FileText className="size-4" /></Link></Button>
          </div>
        </div>
      </div>
      <MercadoView />
    </div>
  )
}
