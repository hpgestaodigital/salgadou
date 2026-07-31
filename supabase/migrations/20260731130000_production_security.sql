-- Segurança de produção do ERP Salgadou.
-- Exige que todo usuário legítimo tenha um papel em app_metadata.

do $$
declare
  tabela text;
  politica record;
begin
  foreach tabela in array array[
    'colaboradores',
    'motoboys',
    'fornecedores',
    'escala',
    'pagamentos_fornecedores',
    'pagamentos_motoboys',
    'configuracoes',
    'kanban_tarefas',
    'entregas_motoboy',
    'reunioes',
    'reunioes_itens'
  ] loop
    for politica in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = tabela
    loop
      execute format('drop policy if exists %I on public.%I', politica.policyname, tabela);
    end loop;

    execute format(
      'create policy %I on public.%I for all to authenticated using ((select auth.uid()) is not null and coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', '''') in (''admin'', ''socio'', ''colaborador'')) with check ((select auth.uid()) is not null and coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', '''') in (''admin'', ''socio'', ''colaborador''))',
      'Papéis do Salgadou gerenciam ' || tabela,
      tabela
    );
  end loop;
end $$;

-- Logs de notificações são gravados apenas pelo serviço do servidor.
drop policy if exists "Autenticados leem logs de notificações" on public.notificacoes_log;
create policy "Papéis do Salgadou leem logs de notificações"
  on public.notificacoes_log for select to authenticated
  using (
    (select auth.uid()) is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'colaborador')
  );

-- O bucket público é usado apenas para marca e avatar. Remove listagem ampla.
drop policy if exists "Leitura pública das imagens do ERP" on storage.objects;

-- Branding: somente administradores definidos em app_metadata.
drop policy if exists "Administrador envia branding" on storage.objects;
create policy "Administrador envia branding" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

drop policy if exists "Administrador atualiza branding" on storage.objects;
create policy "Administrador atualiza branding" on storage.objects
  for update to authenticated using (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  ) with check (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

drop policy if exists "Administrador remove branding" on storage.objects;
create policy "Administrador remove branding" on storage.objects
  for delete to authenticated using (
    bucket_id = 'erp-media'
    and (storage.foldername(name))[1] = 'branding'
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

-- Anexos financeiros ficam em bucket privado e são lidos por URL assinada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-payment-attachments',
  'erp-payment-attachments',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Papéis do Salgadou leem anexos de pagamentos" on storage.objects;
create policy "Papéis do Salgadou leem anexos de pagamentos" on storage.objects
  for select to authenticated using (
    bucket_id = 'erp-payment-attachments'
    and (select auth.uid()) is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'colaborador')
  );

drop policy if exists "Usuário envia anexo privado de pagamento" on storage.objects;
create policy "Usuário envia anexo privado de pagamento" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'erp-payment-attachments'
    and (storage.foldername(name))[1] = 'payments'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'colaborador')
  );

drop policy if exists "Papéis do Salgadou atualizam anexos de pagamentos" on storage.objects;
create policy "Papéis do Salgadou atualizam anexos de pagamentos" on storage.objects
  for update to authenticated using (
    bucket_id = 'erp-payment-attachments'
    and (select auth.uid()) is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'colaborador')
  ) with check (
    bucket_id = 'erp-payment-attachments'
    and (select auth.uid()) is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'colaborador')
  );

drop policy if exists "Papéis do Salgadou removem anexos de pagamentos" on storage.objects;
create policy "Papéis do Salgadou removem anexos de pagamentos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'erp-payment-attachments'
    and (select auth.uid()) is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'colaborador')
  );

-- A política antiga não deve aceitar novos anexos no bucket público.
drop policy if exists "Usuário envia anexos de pagamentos" on storage.objects;

-- Função interna de manutenção não pode ser chamada pela API.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- Exposição explícita e revisável no Data API. RLS continua sendo aplicada.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select, update on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select, update on sequences to authenticated, service_role;
