import { PagamentosFornecedores } from "@/components/pagamentos-fornecedores"
import { ReminderPageLayout } from "@/components/reminder-page-layout"

export default function Page() {
  return (
    <ReminderPageLayout tipo="fornecedor">
      <PagamentosFornecedores />
    </ReminderPageLayout>
  )
}
