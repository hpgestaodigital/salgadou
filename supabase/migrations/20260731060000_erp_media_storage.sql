-- Bucket público para logos e avatares do ERP.
-- Execute no SQL Editor do Supabase somente após revisar.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-media',
  'erp-media',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Leitura pública das imagens do ERP" on storage.objects;
create policy "Leitura pública das imagens do ERP"
  on storage.objects for select
  using (bucket_id = 'erp-media');

-- Cada usuário autenticado só pode gravar na própria pasta avatars/<uid>/.
drop policy if exists "Usuário envia o próprio avatar" on storage.objects;
create policy "Usuário envia o próprio avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "Usuário atualiza o próprio avatar" on storage.objects;
create policy "Usuário atualiza o próprio avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "Usuário remove o próprio avatar" on storage.objects;
create policy "Usuário remove o próprio avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Branding é restrito a usuários reconhecidos como administradores pelo app.
-- Compatível com o metadata role=admin e com o administrador padrão legado.
drop policy if exists "Administrador envia branding" on storage.objects;
create policy "Administrador envia branding"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and (
      auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
      or auth.jwt() ->> 'email' = 'admin@admin.com'
    )
  );

drop policy if exists "Administrador atualiza branding" on storage.objects;
create policy "Administrador atualiza branding"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and (
      auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
      or auth.jwt() ->> 'email' = 'admin@admin.com'
    )
  )
  with check (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and (
      auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
      or auth.jwt() ->> 'email' = 'admin@admin.com'
    )
  );

drop policy if exists "Administrador remove branding" on storage.objects;
create policy "Administrador remove branding"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and (
      auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
      or auth.jwt() ->> 'email' = 'admin@admin.com'
    )
  );
