import Link from "next/link"
import { BookOpenText, ClipboardList, Factory, PackageSearch, PlugZap, Snowflake } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const areas = [
  { href: "/producao", label: "Planejamento", description: "Calendário, produção, congelamento e compras.", icon: Factory },
  { href: "/receitas", label: "Ficha Técnica", description: "Receitas, rendimentos, produção de preparos e molhos.", icon: BookOpenText },
  { href: "/producao/cadastros", label: "Cadastros", description: "Insumos, custos, produtos e vínculos.", icon: ClipboardList },
  { href: "/producao/inventario", label: "Inventário", description: "Contagem física e rastreabilidade completa.", icon: PackageSearch },
  { href: "/estoque-salgadinhos", label: "Estoque Final", description: "Lotes, empacotamento e retiradas de salgadinhos.", icon: Snowflake },
  { href: "/producao/integracoes", label: "Integrações", description: "Saipos, Evolution, iFood e n8n — etapa futura.", icon: PlugZap },
]

export function ProductionModuleHub() {
  return <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{areas.map((area) => { const Icon = area.icon; return <Link key={area.href} href={area.href}><Card className="h-full transition hover:border-primary/50 hover:shadow-sm"><CardContent className="flex items-start gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="size-5" /></div><div><strong>{area.label}</strong><p className="mt-1 text-sm text-muted-foreground">{area.description}</p></div></CardContent></Card></Link> })}</div>
}
