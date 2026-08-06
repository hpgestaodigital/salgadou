create table if not exists public.relatorios_problemas (
  id uuid primary key default gen_random_uuid(),
  comentario text not null check (char_length(btrim(comentario)) > 0),
  anexos text[] not null default '{}',
  usuario_id uuid not null default auth.uid(),
  usuario_nome text not null,
  usuario_email text,
  created_at timestamptz not null default now()
);

alter table public.relatorios_problemas enable row level security;

drop policy if exists relatorios_problemas_inserir_proprio on public.relatorios_problemas;
create policy relatorios_problemas_inserir_proprio
on public.relatorios_problemas
for insert
to authenticated
with check (usuario_id = auth.uid());

drop policy if exists relatorios_problemas_admin_visualizar on public.relatorios_problemas;
create policy relatorios_problemas_admin_visualizar
on public.relatorios_problemas
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  or coalesce(auth.jwt() ->> 'email', '') = 'admin@admin.com'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'relatorios-problemas',
  'relatorios-problemas',
  false,
  52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists relatorios_problemas_upload_proprio on storage.objects;
create policy relatorios_problemas_upload_proprio
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'relatorios-problemas'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists relatorios_problemas_admin_ler_anexos on storage.objects;
create policy relatorios_problemas_admin_ler_anexos
on storage.objects
for select
to authenticated
using (
  bucket_id = 'relatorios-problemas'
  and (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or coalesce(auth.jwt() ->> 'email', '') = 'admin@admin.com'
  )
);

notify pgrst, 'reload schema';
