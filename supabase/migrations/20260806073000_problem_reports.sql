create table if not exists public.relatos_problemas (
  id uuid primary key default gen_random_uuid(),
  comentario text not null check (char_length(btrim(comentario)) > 0),
  anexos jsonb not null default '[]'::jsonb,
  usuario_id uuid not null default auth.uid(),
  usuario_nome text not null,
  created_at timestamptz not null default now()
);

alter table public.relatos_problemas enable row level security;

drop policy if exists "Usuarios enviam relatos" on public.relatos_problemas;
create policy "Usuarios enviam relatos"
on public.relatos_problemas
for insert
to authenticated
with check (usuario_id = auth.uid());

drop policy if exists "Admin consulta relatos" on public.relatos_problemas;
create policy "Admin consulta relatos"
on public.relatos_problemas
for select
to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  or auth.jwt() ->> 'email' = 'admin@admin.com'
);

insert into storage.buckets (id, name, public)
values ('problem-reports', 'problem-reports', false)
on conflict (id) do update set public = false;

drop policy if exists "Usuarios enviam anexos de relatos" on storage.objects;
create policy "Usuarios enviam anexos de relatos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'problem-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Admin consulta anexos de relatos" on storage.objects;
create policy "Admin consulta anexos de relatos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'problem-reports'
  and (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    or auth.jwt() ->> 'email' = 'admin@admin.com'
  )
);

notify pgrst, 'reload schema';
