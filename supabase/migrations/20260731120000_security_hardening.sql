-- Endurecimento de autorização para produção.
-- Papéis privilegiados devem existir em app_metadata, que não pode ser
-- alterado pelo próprio usuário. O e-mail legado é mantido temporariamente.

drop policy if exists "Administrador envia branding" on storage.objects;
create policy "Administrador envia branding" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      or auth.jwt() ->> 'email' = 'admin@admin.com'
    )
  );

drop policy if exists "Administrador atualiza branding" on storage.objects;
create policy "Administrador atualiza branding" on storage.objects
  for update to authenticated using (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      or auth.jwt() ->> 'email' = 'admin@admin.com'
    )
  ) with check (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      or auth.jwt() ->> 'email' = 'admin@admin.com'
    )
  );

drop policy if exists "Administrador remove branding" on storage.objects;
create policy "Administrador remove branding" on storage.objects
  for delete to authenticated using (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      or auth.jwt() ->> 'email' = 'admin@admin.com'
    )
  );
