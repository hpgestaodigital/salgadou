alter table public.pagamentos_fornecedores
  add column if not exists anexo_url text,
  add column if not exists anexo_path text;

alter table public.pagamentos_motoboys
  add column if not exists anexo_url text,
  add column if not exists anexo_path text;

drop policy if exists "Usuário envia anexos de pagamentos" on storage.objects;
create policy "Usuário envia anexos de pagamentos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'payments'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
