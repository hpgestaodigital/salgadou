"use client"

import type { ReactNode } from "react"
import { ReminderSendLauncher, type ReminderPageType } from "@/components/reminder-send-launcher"

export function ReminderPageLayout({
  tipo,
  children,
}: {
  tipo: ReminderPageType
  children: ReactNode
}) {
  return (
    <div className={`reminder-page reminder-page-${tipo}`}>
      <div className="legacy-reminder-content">{children}</div>
      <ReminderSendLauncher tipo={tipo} />
      <style jsx global>{`
        .reminder-page-escala .legacy-reminder-content button:has(svg.lucide-send),
        .reminder-page-fornecedor .legacy-reminder-content button[aria-label="Enviar lembrete no WhatsApp"] {
          display: none !important;
        }
      `}</style>
    </div>
  )
}
