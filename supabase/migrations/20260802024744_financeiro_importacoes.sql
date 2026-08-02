-- Importação segura das planilhas de Fluxo de Caixa e Gastos.

insert into public.perfis_permissoes (papel, modulo, pode_visualizar)
values
  ('admin', 'financeiro', true),
  ('socio', 'financeiro', true),
  ('juridico', 'financeiro', false),
  ('colaborador', 'financeiro', false)
on conflict (papel, modulo) do nothing;

create table if not exists public.financeiro_importacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('fluxo_caixa', 'gastos')),
  arquivo_nome text not null,
  arquivo_path text,
  arquivo_tamanho bigint not null default 0 check (arquivo_tamanho >= 0),
  abas text[] not null default '{}',
  total_linhas integer not null default 0 check (total_linhas >= 0),
  linhas_novas integer not null default 0 check (linhas_novas >= 0),
  linhas_atualizadas integer not null default 0 check (linhas_atualizadas >= 0),
  linhas_ignoradas integer not null default 0 check (linhas_ignoradas >= 0),
  criado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.financeiro_lancamentos (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.financeiro_importacoes(id) on delete cascade,
  chave_origem text not null unique,
  origem text not null check (origem in ('fluxo_caixa', 'gastos')),
  tipo text not null check (tipo in ('entrada', 'saida')),
  competencia date not null,
  data_lancamento date,
  categoria text not null,
  descricao text not null,
  valor numeric(14,2) not null check (valor >= 0),
  quantidade numeric(14,3),
  valor_unitario numeric(14,4),
  pedidos integer,
  aba_origem text not null,
  linha_origem integer not null check (linha_origem > 0),
  observacoes text,
  criado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financeiro_lancamentos_competencia_idx on public.financeiro_lancamentos (competencia, tipo);
create index if not exists financeiro_lancamentos_origem_idx on public.financeiro_lancamentos (origem, aba_origem);
create index if not exists financeiro_lancamentos_importacao_idx on public.financeiro_lancamentos (importacao_id);
create index if not exists financeiro_importacoes_created_at_idx on public.financeiro_importacoes (created_at desc);

alter table public.financeiro_importacoes enable row level security;
alter table public.financeiro_lancamentos enable row level security;

drop policy if exists "Acesso configurado a importações financeiras" on public.financeiro_importacoes;
create policy "Acesso configurado a importações financeiras" on public.financeiro_importacoes for all to authenticated
  using (private.usuario_pode_acessar('financeiro'))
  with check (private.usuario_pode_acessar('financeiro') and criado_por = (select auth.uid()));

drop policy if exists "Acesso configurado a lançamentos financeiros" on public.financeiro_lancamentos;
create policy "Acesso configurado a lançamentos financeiros" on public.financeiro_lancamentos for all to authenticated
  using (private.usuario_pode_acessar('financeiro'))
  with check (private.usuario_pode_acessar('financeiro') and criado_por = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('erp-financeiro', 'erp-financeiro', false, 10485760, array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12'
])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Financeiro lê planilhas" on storage.objects;
create policy "Financeiro lê planilhas" on storage.objects for select to authenticated using (
  bucket_id = 'erp-financeiro' and private.usuario_pode_acessar('financeiro')
);
drop policy if exists "Financeiro envia planilhas" on storage.objects;
create policy "Financeiro envia planilhas" on storage.objects for insert to authenticated with check (
  bucket_id = 'erp-financeiro' and (storage.foldername(name))[1] = 'imports'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.usuario_pode_acessar('financeiro')
);
drop policy if exists "Financeiro remove planilhas" on storage.objects;
create policy "Financeiro remove planilhas" on storage.objects for delete to authenticated using (
  bucket_id = 'erp-financeiro' and private.usuario_pode_acessar('financeiro')
);

revoke all on public.financeiro_importacoes, public.financeiro_lancamentos from anon;
grant select, insert, update, delete on public.financeiro_importacoes, public.financeiro_lancamentos to authenticated, service_role;

create or replace function public.importar_planilha_financeira(
  p_tipo text,
  p_arquivo_nome text,
  p_arquivo_path text,
  p_arquivo_tamanho bigint,
  p_abas text[],
  p_linhas_novas integer,
  p_linhas_atualizadas integer,
  p_linhas_ignoradas integer,
  p_lancamentos jsonb
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  nova_importacao uuid;
begin
  if not private.usuario_pode_acessar('financeiro') then
    raise exception 'Acesso negado ao módulo Financeiro';
  end if;
  if p_tipo not in ('fluxo_caixa', 'gastos') or jsonb_typeof(p_lancamentos) <> 'array' then
    raise exception 'Conteúdo da importação inválido';
  end if;

  insert into public.financeiro_importacoes (
    tipo, arquivo_nome, arquivo_path, arquivo_tamanho, abas, total_linhas,
    linhas_novas, linhas_atualizadas, linhas_ignoradas, criado_por
  ) values (
    p_tipo, left(p_arquivo_nome, 240), p_arquivo_path, p_arquivo_tamanho, p_abas,
    jsonb_array_length(p_lancamentos), p_linhas_novas, p_linhas_atualizadas,
    p_linhas_ignoradas, (select auth.uid())
  ) returning id into nova_importacao;

  insert into public.financeiro_lancamentos (
    importacao_id, chave_origem, origem, tipo, competencia, data_lancamento,
    categoria, descricao, valor, quantidade, valor_unitario, pedidos,
    aba_origem, linha_origem, observacoes, criado_por
  )
  select
    nova_importacao, item.chave_origem, item.origem, item.tipo, item.competencia,
    item.data_lancamento, left(item.categoria, 180), left(item.descricao, 500),
    item.valor, item.quantidade, item.valor_unitario, item.pedidos,
    left(item.aba_origem, 120), item.linha_origem, left(item.observacoes, 1000),
    (select auth.uid())
  from jsonb_to_recordset(p_lancamentos) as item(
    chave_origem text, origem text, tipo text, competencia date, data_lancamento date,
    categoria text, descricao text, valor numeric, quantidade numeric,
    valor_unitario numeric, pedidos integer, aba_origem text, linha_origem integer,
    observacoes text
  )
  on conflict (chave_origem) do update set
    importacao_id = excluded.importacao_id,
    origem = excluded.origem,
    tipo = excluded.tipo,
    competencia = excluded.competencia,
    data_lancamento = excluded.data_lancamento,
    categoria = excluded.categoria,
    descricao = excluded.descricao,
    valor = excluded.valor,
    quantidade = excluded.quantidade,
    valor_unitario = excluded.valor_unitario,
    pedidos = excluded.pedidos,
    aba_origem = excluded.aba_origem,
    linha_origem = excluded.linha_origem,
    observacoes = excluded.observacoes,
    criado_por = excluded.criado_por,
    updated_at = now();

  return nova_importacao;
end;
$$;

revoke all on function public.importar_planilha_financeira(text, text, text, bigint, text[], integer, integer, integer, jsonb) from public, anon;
grant execute on function public.importar_planilha_financeira(text, text, text, bigint, text[], integer, integer, integer, jsonb) to authenticated, service_role;
