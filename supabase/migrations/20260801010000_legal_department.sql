-- Setor Juridico: contratos privados, validacao dos socios e lembretes de assinatura.

create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tipo text,
  contraparte text,
  responsavel_id uuid,
  responsavel_nome text,
  status text not null default 'rascunho' check (status in ('rascunho', 'validacao_socios', 'ajustes', 'aprovado', 'assinatura_pendente', 'assinado', 'arquivado')),
  vencimento date,
  observacoes text,
  anexo_path text,
  anexo_nome text,
  anexo_mime text,
  anexo_tamanho bigint,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contrato_validacoes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  socio_id uuid,
  socio_nome text not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'ajustes')),
  observacao text,
  validado_por uuid,
  validado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (contrato_id, socio_id)
);

create table if not exists public.contrato_signatarios (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  nome text not null,
  email text,
  whatsapp text,
  status text not null default 'pendente' check (status in ('pendente', 'notificado', 'assinado')),
  lembrete_enviado_em timestamptz,
  assinado_em timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.contrato_lembretes (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  tipo text not null check (tipo in ('validacao_socios', 'assinatura')),
  destinatario_nome text not null,
  destinatario_whatsapp text,
  status text not null check (status in ('enviado', 'nao_configurado', 'falhou')),
  erro text,
  enviado_por uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists contratos_status_vencimento_idx on public.contratos (status, vencimento);
create index if not exists contrato_validacoes_contrato_idx on public.contrato_validacoes (contrato_id, status);
create index if not exists contrato_signatarios_contrato_idx on public.contrato_signatarios (contrato_id, status);
create index if not exists contrato_lembretes_contrato_idx on public.contrato_lembretes (contrato_id, created_at desc);

alter table public.contratos enable row level security;
alter table public.contrato_validacoes enable row level security;
alter table public.contrato_signatarios enable row level security;
alter table public.contrato_lembretes enable row level security;

drop policy if exists "Juridico consulta pessoas ativas" on public.colaboradores;
create policy "Juridico consulta pessoas ativas" on public.colaboradores
  for select to authenticated using (
    (select auth.uid()) is not null
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'juridico'
  );

do $$
declare tabela text;
begin
  foreach tabela in array array['contratos', 'contrato_validacoes', 'contrato_signatarios'] loop
    execute format('drop policy if exists %I on public.%I', 'Setor juridico gerencia ' || tabela, tabela);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select auth.uid()) is not null and coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', '''') in (''admin'', ''socio'', ''juridico'')) with check ((select auth.uid()) is not null and coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', '''') in (''admin'', ''socio'', ''juridico''))',
      'Setor juridico gerencia ' || tabela,
      tabela
    );
  end loop;
end $$;

drop policy if exists "Setor juridico le lembretes" on public.contrato_lembretes;
create policy "Setor juridico le lembretes" on public.contrato_lembretes
  for select to authenticated using (
    (select auth.uid()) is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-legal-contracts',
  'erp-legal-contracts',
  false,
  10485760,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Setor juridico le contratos" on storage.objects;
create policy "Setor juridico le contratos" on storage.objects for select to authenticated using (
  bucket_id = 'erp-legal-contracts'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
);

drop policy if exists "Setor juridico envia contratos" on storage.objects;
create policy "Setor juridico envia contratos" on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-legal-contracts'
  and (storage.foldername(name))[1] = 'contracts'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
);

drop policy if exists "Setor juridico atualiza contratos" on storage.objects;
create policy "Setor juridico atualiza contratos" on storage.objects for update to authenticated using (
  bucket_id = 'erp-legal-contracts'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
) with check (
  bucket_id = 'erp-legal-contracts'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
);

drop policy if exists "Setor juridico remove contratos" on storage.objects;
create policy "Setor juridico remove contratos" on storage.objects for delete to authenticated using (
  bucket_id = 'erp-legal-contracts'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
);

revoke all on public.contratos, public.contrato_validacoes, public.contrato_signatarios, public.contrato_lembretes from anon;
grant select, insert, update, delete on public.contratos, public.contrato_validacoes, public.contrato_signatarios to authenticated, service_role;
grant select on public.contrato_lembretes to authenticated;
grant select, insert, update, delete on public.contrato_lembretes to service_role;
