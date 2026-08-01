-- Documentos gerais do setor Juridico, separados do fluxo de contratos.

create table if not exists public.documentos_juridicos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  categoria text not null default 'Outro',
  descricao text,
  data_documento date,
  referencia text,
  responsavel_id uuid,
  responsavel_nome text,
  anexo_path text not null,
  anexo_nome text not null,
  anexo_mime text,
  anexo_tamanho bigint,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documentos_juridicos_titulo_valido check (length(trim(titulo)) between 1 and 200),
  constraint documentos_juridicos_anexo_tamanho_valido check (anexo_tamanho is null or anexo_tamanho between 1 and 10485760)
);

create index if not exists documentos_juridicos_categoria_data_idx
  on public.documentos_juridicos (categoria, data_documento desc);

alter table public.documentos_juridicos enable row level security;

drop policy if exists "Setor juridico gerencia documentos gerais" on public.documentos_juridicos;
create policy "Setor juridico gerencia documentos gerais" on public.documentos_juridicos
  for all to authenticated
  using (
    (select auth.uid()) is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
  )
  with check (
    (select auth.uid()) is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
  );

drop policy if exists "Setor juridico envia documentos gerais" on storage.objects;
create policy "Setor juridico envia documentos gerais" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'erp-legal-contracts'
    and (storage.foldername(name))[1] = 'documents'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
  );

revoke all on public.documentos_juridicos from anon;
grant select, insert, update, delete on public.documentos_juridicos to authenticated, service_role;
