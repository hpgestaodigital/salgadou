-- Impede que policies antigas e amplas do bucket de pagamentos
-- também autorizem acesso aos arquivos de notas do Mercado.
--
-- As notas de compra ficam em purchases/{usuario_id}/... e continuam
-- protegidas exclusivamente pelas policies específicas do módulo Mercado.

-- SELECT amplo legado: mantém o comportamento anterior fora de purchases/.
drop policy if exists "Financeiro acesso adf1919f84f8e548785f0ffdcba23015"
  on storage.objects;
create policy "Financeiro acesso adf1919f84f8e548785f0ffdcba23015"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'erp-payment-attachments'
    and coalesce((storage.foldername(name))[1], '') <> 'purchases'
    and (select auth.uid()) is not null
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = any (
      array['financeiro', 'socio', 'colaborador']
    )
  );

drop policy if exists "Papéis do Salgadou leem anexos de pagamentos"
  on storage.objects;
create policy "Papéis do Salgadou leem anexos de pagamentos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'erp-payment-attachments'
    and coalesce((storage.foldername(name))[1], '') <> 'purchases'
    and (select auth.uid()) is not null
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = any (
      array['admin', 'socio', 'colaborador']
    )
  );

-- UPDATE amplo legado: não alcança notas do Mercado.
drop policy if exists "Financeiro acesso 55d95430584e0734960c78e50e4c524d"
  on storage.objects;
create policy "Financeiro acesso 55d95430584e0734960c78e50e4c524d"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'erp-payment-attachments'
    and coalesce((storage.foldername(name))[1], '') <> 'purchases'
    and (select auth.uid()) is not null
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = any (
      array['financeiro', 'socio', 'colaborador']
    )
  )
  with check (
    bucket_id = 'erp-payment-attachments'
    and coalesce((storage.foldername(name))[1], '') <> 'purchases'
    and (select auth.uid()) is not null
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = any (
      array['financeiro', 'socio', 'colaborador']
    )
  );

drop policy if exists "Papéis do Salgadou atualizam anexos de pagamentos"
  on storage.objects;
create policy "Papéis do Salgadou atualizam anexos de pagamentos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'erp-payment-attachments'
    and coalesce((storage.foldername(name))[1], '') <> 'purchases'
    and (select auth.uid()) is not null
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = any (
      array['admin', 'socio', 'colaborador']
    )
  )
  with check (
    bucket_id = 'erp-payment-attachments'
    and coalesce((storage.foldername(name))[1], '') <> 'purchases'
    and (select auth.uid()) is not null
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = any (
      array['admin', 'socio', 'colaborador']
    )
  );

-- DELETE amplo legado: notas vinculadas ao Mercado só podem ser removidas
-- pela policy específica que exige dono, permissão e ausência de vínculo.
drop policy if exists "Financeiro acesso 18900ed694a56c828496ce949f095cc0"
  on storage.objects;
create policy "Financeiro acesso 18900ed694a56c828496ce949f095cc0"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'erp-payment-attachments'
    and coalesce((storage.foldername(name))[1], '') <> 'purchases'
    and (select auth.uid()) is not null
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = any (
      array['financeiro', 'socio', 'colaborador']
    )
  );

drop policy if exists "Papéis do Salgadou removem anexos de pagamentos"
  on storage.objects;
create policy "Papéis do Salgadou removem anexos de pagamentos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'erp-payment-attachments'
    and coalesce((storage.foldername(name))[1], '') <> 'purchases'
    and (select auth.uid()) is not null
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = any (
      array['admin', 'socio', 'colaborador']
    )
  );
