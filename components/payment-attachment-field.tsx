"use client"

import { useEffect, useState } from "react"
import { FileText, ImageIcon, Loader2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export function PaymentAttachmentField({
  url,
  path,
  onChange,
  label = "Imagem do pagamento (opcional)",
  helper = "JPG, PNG ou WebP · máximo 2 MB.",
  previewAlt = "Prévia do anexo do pagamento",
  storageFolder = "",
  allowPdf = false,
}: {
  url: string
  path: string
  onChange: (value: { url: string; path: string }) => void
  label?: string
  helper?: string
  previewAlt?: string
  storageFolder?: string
  allowPdf?: boolean
}) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(url)
  const isPdf = path.toLowerCase().endsWith(".pdf") || url.toLowerCase().includes(".pdf")

  useEffect(() => {
    let ativo = true

    async function carregarPreview() {
      if (!path) {
        setPreviewUrl(url)
        return
      }

      const { data, error } = await supabase.storage
        .from("erp-payment-attachments")
        .createSignedUrl(path, 60 * 60)

      if (!ativo) return
      setPreviewUrl(error ? url : data.signedUrl)
    }

    carregarPreview()
    return () => {
      ativo = false
    }
  }, [path, url, supabase])

  async function enviar(file: File) {
    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp", ...(allowPdf ? ["application/pdf"] : [])]
    if (!tiposPermitidos.includes(file.type)) {
      return toast.error(allowPdf ? "Use PDF, JPG, PNG ou WebP." : "Use JPG, PNG ou WebP.")
    }
    const limite = allowPdf ? 5 * 1024 * 1024 : 2 * 1024 * 1024
    if (file.size > limite) return toast.error(`O arquivo deve ter no máximo ${allowPdf ? 5 : 2} MB.`)
    setUploading(true)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error("Sessão expirada")
      const ext = file.name.split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "jpg")
      const segmento = storageFolder ? `${storageFolder.replace(/[^a-z0-9_-]/gi, "")}/` : ""
      const storagePath = `payments/${auth.user.id}/${segmento}${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from("erp-payment-attachments").upload(storagePath, file, { contentType: file.type })
      if (error) throw error
      const { data, error: signedError } = await supabase.storage
        .from("erp-payment-attachments")
        .createSignedUrl(storagePath, 60 * 60)
      if (signedError) throw signedError
      if (path) await supabase.storage.from("erp-payment-attachments").remove([path])
      setPreviewUrl(data.signedUrl)
      onChange({ url: "", path: storagePath })
      toast.success(file.type === "application/pdf" ? "PDF anexado." : "Imagem anexada.")
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : ""
      toast.error(message.includes("bucket") ? "Aplique a migração do armazenamento privado de pagamentos." : "Não foi possível anexar o arquivo.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border p-4 sm:col-span-2">
      <Label>{label}</Label>
      {previewUrl ? (
        isPdf ? (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="flex h-24 items-center justify-center gap-2 rounded-lg bg-muted/40 text-sm font-medium text-primary hover:underline">
            <FileText className="size-6" />Abrir PDF anexado
          </a>
        ) : (
          <img src={previewUrl} alt={previewAlt} className="h-36 w-full rounded-lg bg-muted object-contain" />
        )
      ) : (
        <div className="grid h-24 place-items-center rounded-lg bg-muted/40 text-muted-foreground">
          {allowPdf ? <FileText className="size-7" /> : <ImageIcon className="size-7" />}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <label className="cursor-pointer">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {previewUrl ? "Substituir arquivo" : "Selecionar arquivo"}
            <input className="sr-only" type="file" accept={allowPdf ? "application/pdf,image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp"} disabled={uploading} onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) enviar(file)
              e.currentTarget.value = ""
            }} />
          </label>
        </Button>
        {previewUrl && <Button type="button" variant="ghost" onClick={async () => {
          if (path) await supabase.storage.from("erp-payment-attachments").remove([path])
          setPreviewUrl("")
          onChange({ url: "", path: "" })
        }}><Trash2 className="size-4" />Remover</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{helper}</p>
    </div>
  )
}
