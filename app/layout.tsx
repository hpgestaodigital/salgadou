import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import { Nunito, Nunito_Sans } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import { AppShell } from "@/components/app-shell"
import "./globals.css"

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["600", "700", "800"],
})

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "600", "700"],
})

export const metadata: Metadata = {
  title: "Salgadou · Gestão",
  description: "Sistema interno de gestão de escala, pagamentos e cadastros da Salgadou",
  generator: "v0.app",
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#2a231d" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`dark bg-background ${nunito.variable} ${nunitoSans.variable}`}>
      <body className="antialiased font-body">
        <AppShell>{children}</AppShell>
        <Toaster richColors position="top-right" />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
