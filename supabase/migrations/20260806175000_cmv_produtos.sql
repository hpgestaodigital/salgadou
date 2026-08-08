-- CMV por produto, usando os custos calculados pelas fichas técnicas.

create table if not exists public.cmv_produtos (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null unique references public.producao_fichas_tecnicas(id) on delete cascade,
  quantidade_venda numeric(14,4) not null default 1 check (quantidade_venda > 0),
  preco_venda numeric(14,2) not null default 0 check (preco_venda >= 0),
  custo_embalagem numeric(14,4) not null default 0 check (custo_embalagem >= 0),
  outros_custos_diretos numeric(14,4) not null default 0 check (outros_custos_diretos >= 0),
  taxa_venda_percentual numeric(7,4) not null default 0 check (taxa_venda_percentual >= 0 and taxa_venda_percentual <= 100),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cmv_produtos enable row level security;

drop policy if exists "CMV consulta autorizada" on public.cmv_produtos;
create policy "CMV consulta autorizada"
  on public.cmv_produtos for select to authenticated
  using (private.usuario_pode_acessar('cmv'));

drop policy if exists "CMV gerencia autorizado" on public.cmv_produtos;
create policy "CMV gerencia autorizado"
  on public.cmv_produtos for all to authenticated
  using (private.usuario_pode_acessar('cmv'))
  with check (private.usuario_pode_acessar('cmv'));

grant select, insert, update, delete on public.cmv_produtos to authenticated;

insert into public.perfis_permissoes (papel, modulo, pode_visualizar, updated_at)
values
  ('admin', 'cmv', true, now()),
  ('socio', 'cmv', true, now()),
  ('financeiro', 'cmv', true, now()),
  ('colaborador', 'cmv', false, now()),
  ('juridico', 'cmv', false, now())
on conflict (papel, modulo) do update
set pode_visualizar = excluded.pode_visualizar, updated_at = now();

create index if not exists cmv_produtos_ficha_idx on public.cmv_produtos (ficha_id);
