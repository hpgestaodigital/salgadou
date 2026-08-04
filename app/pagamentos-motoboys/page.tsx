import { PagamentosMotoboys } from "@/components/pagamentos-motoboys"
import { ReminderPageLayout } from "@/components/reminder-page-layout"

export default function Page() {
  return (
    <ReminderPageLayout tipo="motoboy">
      <PagamentosMotoboys />
    </ReminderPageLayout>
  )
}
