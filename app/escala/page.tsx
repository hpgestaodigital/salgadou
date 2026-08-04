import { EscalaView } from "@/components/escala-view"
import { ReminderPageLayout } from "@/components/reminder-page-layout"

export default function Page() {
  return (
    <ReminderPageLayout tipo="escala">
      <EscalaView />
    </ReminderPageLayout>
  )
}
