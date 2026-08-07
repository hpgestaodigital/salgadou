import { Configuracoes } from "@/components/configuracoes"
import { ReminderRecipientSettings } from "@/components/reminder-recipient-settings"
import { OpenAISettings } from "@/components/openai-settings"
import { PaymentMethodSettings } from "@/components/payment-method-settings"

export default function Page() {
  return (
    <>
      <Configuracoes />
      <OpenAISettings />
      <PaymentMethodSettings />
      <ReminderRecipientSettings />
    </>
  )
}
