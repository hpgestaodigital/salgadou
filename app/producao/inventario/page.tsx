import { ProductionModuleHub } from "@/components/production-module-hub"
import { ProductionInventoryControl } from "@/components/production-inventory-control"

export default function InventarioProducaoPage() {
  return <div className="space-y-6"><ProductionModuleHub /><ProductionInventoryControl /></div>
}
