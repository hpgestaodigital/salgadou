-- Permissões configuráveis e módulo de Produção do ERP Salgadou.
-- Esta migração permanece na branch de desenvolvimento até a aprovação.

create schema if not exists private;

create table if not exists public.perfis_permissoes (
  papel text not null check (papel in ('admin', 'socio', 'juridico', 'colaborador')),
  modulo text not null,
  pode_visualizar boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (papel, modulo)
);

create table if not exists public.usuarios_permissoes (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null,
  pode_visualizar boolean not null,
  updated_at timestamptz not null default now(),
  primary key (usuario_id, modulo)
);

insert into public.perfis_permissoes (papel, modulo, pode_visualizar)
select papel, modulo, pode_visualizar
from (values
  ('admin','dashboard',true), ('admin','escala',true), ('admin','kanban',true),
  ('admin','reunioes',true), ('admin','juridico',true), ('admin','historico',true),
  ('admin','pagamentos_fornecedores',true), ('admin','pagamentos_motoboys',true),
  ('admin','cadastros',true), ('admin','usuarios',true), ('admin','configuracoes',true),
  ('admin','producao_compras',true), ('admin','producao_estoque',true), ('admin','producao_planejamento',true),

  ('socio','dashboard',true), ('socio','escala',true), ('socio','kanban',true),
  ('socio','reunioes',true), ('socio','juridico',true), ('socio','historico',true),
  ('socio','pagamentos_fornecedores',true), ('socio','pagamentos_motoboys',true),
  ('socio','cadastros',true), ('socio','usuarios',true), ('socio','configuracoes',true),
  ('socio','producao_compras',true), ('socio','producao_estoque',true), ('socio','producao_planejamento',true),

  ('juridico','dashboard',false), ('juridico','escala',false), ('juridico','kanban',false),
  ('juridico','reunioes',false), ('juridico','juridico',true), ('juridico','historico',false),
  ('juridico','pagamentos_fornecedores',false), ('juridico','pagamentos_motoboys',false),
  ('juridico','cadastros',false), ('juridico','usuarios',false), ('juridico','configuracoes',false),
  ('juridico','producao_compras',false), ('juridico','producao_estoque',false), ('juridico','producao_planejamento',false),

  ('colaborador','dashboard',true), ('colaborador','escala',true), ('colaborador','kanban',true),
  ('colaborador','reunioes',true), ('colaborador','juridico',false), ('colaborador','historico',false),
  ('colaborador','pagamentos_fornecedores',false), ('colaborador','pagamentos_motoboys',false),
  ('colaborador','cadastros',false), ('colaborador','usuarios',false), ('colaborador','configuracoes',false),
  ('colaborador','producao_compras',false), ('colaborador','producao_estoque',true),
  ('colaborador','producao_planejamento',true)
) as defaults(papel, modulo, pode_visualizar)
on conflict (papel, modulo) do nothing;

create or replace function private.usuario_pode_acessar(modulo_consultado text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select (select auth.uid()) is not null
    and coalesce(
      (
        select up.pode_visualizar
        from public.usuarios_permissoes up
        where up.usuario_id = (select auth.uid())
          and up.modulo = modulo_consultado
      ),
      (
        select pp.pode_visualizar
        from public.perfis_permissoes pp
        where pp.papel = coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
          and pp.modulo = modulo_consultado
      ),
      false
    );
$$;

revoke all on function private.usuario_pode_acessar(text) from public, anon;
grant execute on function private.usuario_pode_acessar(text) to authenticated, service_role;

alter table public.perfis_permissoes enable row level security;
alter table public.usuarios_permissoes enable row level security;

drop policy if exists "Autenticados consultam permissões padrão" on public.perfis_permissoes;
create policy "Autenticados consultam permissões padrão"
  on public.perfis_permissoes for select to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists "Sócios administram permissões padrão" on public.perfis_permissoes;
create policy "Sócios administram permissões padrão"
  on public.perfis_permissoes for all to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','socio'))
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','socio'));

drop policy if exists "Usuário consulta suas permissões" on public.usuarios_permissoes;
create policy "Usuário consulta suas permissões"
  on public.usuarios_permissoes for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','socio')
  );

drop policy if exists "Sócios administram permissões individuais" on public.usuarios_permissoes;
create policy "Sócios administram permissões individuais"
  on public.usuarios_permissoes for all to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','socio'))
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','socio'));

create table if not exists public.producao_insumos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade text not null check (unidade in ('un','kg','g','l','ml','pct','cx')),
  estoque_atual numeric(14,3) not null default 0 check (estoque_atual >= 0),
  estoque_minimo numeric(14,3) not null default 0 check (estoque_minimo >= 0),
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.producao_produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  unidade text not null default 'un',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.producao_receitas (
  produto_id uuid not null references public.producao_produtos(id) on delete cascade,
  insumo_id uuid not null references public.producao_insumos(id) on delete restrict,
  quantidade_por_unidade numeric(14,4) not null check (quantidade_por_unidade > 0),
  primary key (produto_id, insumo_id)
);

create table if not exists public.producao_planejamento (
  id uuid primary key default gen_random_uuid(),
  data_producao date not null,
  produto_id uuid not null references public.producao_produtos(id) on delete restrict,
  quantidade numeric(14,3) not null check (quantidade > 0),
  status text not null default 'planejado' check (status in ('planejado','em_producao','concluido','cancelado')),
  observacoes text,
  criado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.producao_lista_compras (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.producao_insumos(id) on delete restrict,
  data_necessidade date,
  quantidade_necessaria numeric(14,3) not null check (quantidade_necessaria > 0),
  quantidade_comprada numeric(14,3) not null default 0 check (quantidade_comprada >= 0),
  status text not null default 'pendente' check (status in ('pendente','comprado','cancelado')),
  observacoes text,
  criado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists producao_planejamento_data_idx
  on public.producao_planejamento (data_producao, status);
create index if not exists producao_planejamento_produto_idx
  on public.producao_planejamento (produto_id);
create index if not exists producao_receitas_insumo_idx
  on public.producao_receitas (insumo_id);
create index if not exists producao_lista_compras_status_data_idx
  on public.producao_lista_compras (status, data_necessidade);
create unique index if not exists producao_insumos_nome_ativo_uidx
  on public.producao_insumos (lower(nome)) where ativo;
create unique index if not exists producao_produtos_nome_ativo_uidx
  on public.producao_produtos (lower(nome)) where ativo;

create or replace view public.producao_necessidades
with (security_invoker = true)
as
select
  p.data_producao,
  i.id as insumo_id,
  i.nome as insumo,
  i.unidade,
  sum(p.quantidade * r.quantidade_por_unidade)::numeric(14,3) as quantidade_necessaria,
  i.estoque_atual,
  greatest(
    sum(p.quantidade * r.quantidade_por_unidade) - i.estoque_atual,
    0
  )::numeric(14,3) as quantidade_a_comprar
from public.producao_planejamento p
join public.producao_receitas r on r.produto_id = p.produto_id
join public.producao_insumos i on i.id = r.insumo_id
where p.status in ('planejado','em_producao')
  and i.ativo
group by p.data_producao, i.id, i.nome, i.unidade, i.estoque_atual;

alter table public.producao_insumos enable row level security;
alter table public.producao_produtos enable row level security;
alter table public.producao_receitas enable row level security;
alter table public.producao_planejamento enable row level security;
alter table public.producao_lista_compras enable row level security;

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('producao_insumos','producao_estoque'),
      ('producao_produtos','producao_planejamento'),
      ('producao_receitas','producao_planejamento'),
      ('producao_planejamento','producao_planejamento'),
      ('producao_lista_compras','producao_compras')
    ) as x(tabela, modulo)
  loop
    execute format('drop policy if exists %I on public.%I',
      'Permissão de módulo ' || item.tabela, item.tabela);
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.usuario_pode_acessar(%L)) with check (private.usuario_pode_acessar(%L))',
      'Permissão de módulo ' || item.tabela, item.tabela, item.modulo, item.modulo
    );
  end loop;
end $$;

revoke all on public.perfis_permissoes, public.usuarios_permissoes,
  public.producao_insumos, public.producao_produtos, public.producao_receitas,
  public.producao_planejamento, public.producao_lista_compras,
  public.producao_necessidades from anon;

grant select, insert, update, delete on public.perfis_permissoes,
  public.usuarios_permissoes, public.producao_insumos, public.producao_produtos,
  public.producao_receitas, public.producao_planejamento,
  public.producao_lista_compras to authenticated, service_role;
grant select on public.producao_necessidades to authenticated, service_role;
