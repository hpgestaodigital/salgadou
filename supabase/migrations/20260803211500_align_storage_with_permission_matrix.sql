-- Substitui políticas antigas de Storage baseadas apenas em papel pela matriz configurável do ERP.
do $block$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end;
$block$;

-- Avatares: cada usuário gerencia somente a própria pasta.
create policy "Usuário visualiza o próprio avatar"
on storage.objects for select to authenticated
using (
  bucket_id = 'erp-media'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
create policy "Usuário envia o próprio avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'erp-media'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
create policy "Usuário atualiza o próprio avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'erp-media'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'erp-media'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
create policy "Usuário remove o próprio avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'erp-media'
  and (storage.foldername(name))[1] = 'avatars'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

-- Branding: leitura para usuários autenticados; gestão somente por Configurações.
create policy "Usuários visualizam branding"
on storage.objects for select to authenticated
using (bucket_id = 'erp-media' and (storage.foldername(name))[1] = 'branding');
create policy "Configurações envia branding"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'erp-media'
  and (storage.foldername(name))[1] = 'branding'
  and private.usuario_pode_acessar('configuracoes')
);
create policy "Configurações atualiza branding"
on storage.objects for update to authenticated
using (
  bucket_id = 'erp-media'
  and (storage.foldername(name))[1] = 'branding'
  and private.usuario_pode_acessar('configuracoes')
)
with check (
  bucket_id = 'erp-media'
  and (storage.foldername(name))[1] = 'branding'
  and private.usuario_pode_acessar('configuracoes')
);
create policy "Configurações remove branding"
on storage.objects for delete to authenticated
using (
  bucket_id = 'erp-media'
  and (storage.foldername(name))[1] = 'branding'
  and private.usuario_pode_acessar('configuracoes')
);

-- Anexos de pagamentos: somente quem possui um dos módulos de pagamento.
create policy "Pagamentos visualizam anexos"
on storage.objects for select to authenticated
using (
  bucket_id = 'erp-payment-attachments'
  and (storage.foldername(name))[1] = 'payments'
  and (
    private.usuario_pode_acessar('pagamentos_fornecedores')
    or private.usuario_pode_acessar('pagamentos_motoboys')
  )
);
create policy "Pagamentos enviam anexos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'erp-payment-attachments'
  and (storage.foldername(name))[1] = 'payments'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (
    private.usuario_pode_acessar('pagamentos_fornecedores')
    or private.usuario_pode_acessar('pagamentos_motoboys')
  )
);
create policy "Pagamentos atualizam anexos"
on storage.objects for update to authenticated
using (
  bucket_id = 'erp-payment-attachments'
  and (storage.foldername(name))[1] = 'payments'
  and (
    private.usuario_pode_acessar('pagamentos_fornecedores')
    or private.usuario_pode_acessar('pagamentos_motoboys')
  )
)
with check (
  bucket_id = 'erp-payment-attachments'
  and (storage.foldername(name))[1] = 'payments'
  and (
    private.usuario_pode_acessar('pagamentos_fornecedores')
    or private.usuario_pode_acessar('pagamentos_motoboys')
  )
);
create policy "Pagamentos removem anexos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'erp-payment-attachments'
  and (storage.foldername(name))[1] = 'payments'
  and (
    private.usuario_pode_acessar('pagamentos_fornecedores')
    or private.usuario_pode_acessar('pagamentos_motoboys')
  )
);

-- Notas de compras do Mercado.
create policy "Mercado visualiza notas"
on storage.objects for select to authenticated
using (
  bucket_id = 'erp-payment-attachments'
  and (storage.foldername(name))[1] = 'purchases'
  and private.usuario_pode_acessar('producao_compras')
);
create policy "Mercado envia notas"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'erp-payment-attachments'
  and (storage.foldername(name))[1] = 'purchases'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.usuario_pode_acessar('producao_compras')
);
create policy "Mercado remove notas não vinculadas"
on storage.objects for delete to authenticated
using (
  bucket_id = 'erp-payment-attachments'
  and (storage.foldername(name))[1] = 'purchases'
  and private.usuario_pode_acessar('producao_compras')
  and not exists (
    select 1 from public.mercado_compras compra where compra.nota_path = storage.objects.name
  )
);

-- Planilhas financeiras.
create policy "Financeiro visualiza planilhas"
on storage.objects for select to authenticated
using (bucket_id = 'erp-financeiro' and private.usuario_pode_acessar('financeiro'));
create policy "Financeiro envia planilhas"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'erp-financeiro'
  and (storage.foldername(name))[1] = 'imports'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.usuario_pode_acessar('financeiro')
);
create policy "Financeiro remove planilhas"
on storage.objects for delete to authenticated
using (bucket_id = 'erp-financeiro' and private.usuario_pode_acessar('financeiro'));

-- Documentos e contratos jurídicos.
create policy "Jurídico visualiza arquivos"
on storage.objects for select to authenticated
using (bucket_id = 'erp-legal-contracts' and private.usuario_pode_acessar('juridico'));
create policy "Jurídico envia arquivos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'erp-legal-contracts'
  and (storage.foldername(name))[1] in ('contracts', 'documents')
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.usuario_pode_acessar('juridico')
);
create policy "Jurídico atualiza arquivos"
on storage.objects for update to authenticated
using (bucket_id = 'erp-legal-contracts' and private.usuario_pode_acessar('juridico'))
with check (bucket_id = 'erp-legal-contracts' and private.usuario_pode_acessar('juridico'));
create policy "Jurídico remove arquivos"
on storage.objects for delete to authenticated
using (bucket_id = 'erp-legal-contracts' and private.usuario_pode_acessar('juridico'));
