-- Meios de pagamento configuráveis e vínculo com compras de mercado.

create table if not exists public.financeiro_contas_pagamento (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  pix_habilitado boolean not null default true,
  ativo boolean not null default true,
  criado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_contas_pagamento_nome_unique unique (nome)
);

create table if not exists public.financeiro_cartoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.financeiro_contas_pagamento(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  modalidade text not null check (modalidade in ('debito','credito')),
  bandeira text,
  final_4 text check (final_4 is null or final_4 ~ '^[0-9]{4}$'),
  ativo boolean not null default true,
  criado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_cartoes_conta_nome_modalidade_unique unique (conta_id, nome, modalidade)
);

create index if not exists financeiro_cartoes_conta_idx on public.financeiro_cartoes(conta_id);

alter table public.financeiro_contas_pagamento enable row level security;
alter table public.financeiro_cartoes enable row level security;

drop policy if exists "Contas pagamento consulta" on public.financeiro_contas_pagamento;
create policy "Contas pagamento consulta" on public.financeiro_contas_pagamento
for select to authenticated using (true);

drop policy if exists "Cartoes consulta" on public.financeiro_cartoes;
create policy "Cartoes consulta" on public.financeiro_cartoes
for select to authenticated using (true);

drop policy if exists "Administrador gerencia contas pagamento" on public.financeiro_contas_pagamento;
create policy "Administrador gerencia contas pagamento" on public.financeiro_contas_pagamento
for all to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  or auth.jwt() ->> 'email' = 'admin@admin.com'
)
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  or auth.jwt() ->> 'email' = 'admin@admin.com'
);

drop policy if exists "Administrador gerencia cartoes" on public.financeiro_cartoes;
create policy "Administrador gerencia cartoes" on public.financeiro_cartoes
for all to authenticated
using (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  or auth.jwt() ->> 'email' = 'admin@admin.com'
)
with check (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  or auth.jwt() ->> 'email' = 'admin@admin.com'
);

grant select on public.financeiro_contas_pagamento, public.financeiro_cartoes to authenticated;
grant insert, update, delete on public.financeiro_contas_pagamento, public.financeiro_cartoes to authenticated;
grant all on public.financeiro_contas_pagamento, public.financeiro_cartoes to service_role;

alter table public.mercado_compras
  add column if not exists pagamento_tipo text,
  add column if not exists pagamento_conta_id uuid references public.financeiro_contas_pagamento(id) on delete restrict,
  add column if not exists pagamento_cartao_id uuid references public.financeiro_cartoes(id) on delete restrict,
  add column if not exists pagamento_detalhe_lido text;

alter table public.mercado_compras drop constraint if exists mercado_compras_pagamento_tipo_check;
alter table public.mercado_compras add constraint mercado_compras_pagamento_tipo_check
check (pagamento_tipo is null or pagamento_tipo in ('dinheiro','pix','debito','credito','outro'));

create or replace function public.registrar_compra_mercado_v3(
  p_fornecedor_id uuid,
  p_data_compra date,
  p_itens jsonb,
  p_observacoes text default null,
  p_nota_paths text[] default '{}'::text[],
  p_local_compra text default null,
  p_idempotency_key uuid default gen_random_uuid(),
  p_pagamento_tipo text default null,
  p_pagamento_conta_id uuid default null,
  p_pagamento_cartao_id uuid default null,
  p_pagamento_detalhe_lido text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_compra_id uuid;
  v_modalidade text;
  v_conta_cartao uuid;
begin
  if v_usuario_id is null or not private.usuario_pode_acessar('producao_compras') then
    raise exception 'Acesso negado';
  end if;

  if p_pagamento_tipo is not null and p_pagamento_tipo not in ('dinheiro','pix','debito','credito','outro') then
    raise exception 'Forma de pagamento inválida';
  end if;

  if p_pagamento_tipo = 'dinheiro' then
    p_pagamento_conta_id := null;
    p_pagamento_cartao_id := null;
  elsif p_pagamento_tipo = 'pix' then
    if p_pagamento_conta_id is null or not exists (
      select 1 from public.financeiro_contas_pagamento
      where id = p_pagamento_conta_id and ativo = true and pix_habilitado = true
    ) then
      raise exception 'Selecione uma conta com PIX habilitado';
    end if;
    p_pagamento_cartao_id := null;
  elsif p_pagamento_tipo in ('debito','credito') then
    if p_pagamento_cartao_id is null then raise exception 'Selecione o cartão utilizado'; end if;
    select modalidade, conta_id into v_modalidade, v_conta_cartao
    from public.financeiro_cartoes
    where id = p_pagamento_cartao_id and ativo = true;
    if not found or v_modalidade <> p_pagamento_tipo then
      raise exception 'Cartão incompatível com a modalidade selecionada';
    end if;
    p_pagamento_conta_id := v_conta_cartao;
  elsif p_pagamento_tipo = 'outro' then
    p_pagamento_conta_id := null;
    p_pagamento_cartao_id := null;
  end if;

  v_compra_id := public.registrar_compra_mercado_v2(
    p_fornecedor_id,
    p_data_compra,
    p_itens,
    p_observacoes,
    p_nota_paths,
    p_local_compra,
    p_idempotency_key
  );

  update public.mercado_compras
  set pagamento_tipo = p_pagamento_tipo,
      pagamento_conta_id = p_pagamento_conta_id,
      pagamento_cartao_id = p_pagamento_cartao_id,
      pagamento_detalhe_lido = nullif(btrim(p_pagamento_detalhe_lido), '')
  where id = v_compra_id;

  return v_compra_id;
end;
$$;

revoke all on function public.registrar_compra_mercado_v3(uuid,date,jsonb,text,text[],text,uuid,text,uuid,uuid,text) from public, anon;
grant execute on function public.registrar_compra_mercado_v3(uuid,date,jsonb,text,text[],text,uuid,text,uuid,uuid,text) to authenticated, service_role;
