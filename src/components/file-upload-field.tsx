import { useRef, useState } from "react";
import { Paperclip, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export async function signedUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}

export function FileUploadField({
  bucket,
  value,
  onChange,
  label = "Comprovante",
}: {
  bucket: string;
  value: string | null;
  onChange: (path: string | null) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file);
    setBusy(false);
    if (error) {
      toast.error("Falha ao enviar arquivo.");
      return;
    }
    onChange(path);
    toast.success("Arquivo enviado.");
  }

  async function openFile() {
    if (!value) return;
    try {
      window.open(await signedUrl(bucket, value), "_blank", "noopener");
    } catch {
      toast.error("Não foi possível abrir o arquivo.");
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="mr-1 h-4 w-4" />
          )}
          Enviar arquivo
        </Button>
        {value && (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={openFile}>
              <ExternalLink className="mr-1 h-4 w-4" /> Abrir
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(null)}
            >
              Remover
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
