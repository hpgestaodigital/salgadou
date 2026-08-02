-- Metas organizacionais: leitura para toda a equipe e gestão restrita.
insert into public.perfis_permissoes (papel, modulo, pode_visualizar, updated_at)
values
  ('admin', 'metas', true, now()),
  ('financeiro', 'metas', true, now()),
  ('socio', 'metas', true, now()),
  ('juridico', 'metas', false, now()),
  ('colaborador', 'metas', false, now())
on conflict (papel, modulo) do update
set pode_visualizar = excluded.pode_visualizar, updated_at = excluded.updated_at;

create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(trim(titulo)) between 2 and 120),
  descricao text,
  valor_atual numeric(14,2) not null default 0 check (valor_atual >= 0),
  valor_meta numeric(14,2) not null check (valor_meta > 0),
  unidade text not null default 'R$' check (char_length(trim(unidade)) between 1 and 20),
  data_inicio date,
  prazo date,
  status text not null default 'em_andamento' check (status in ('planejada', 'em_andamento', 'concluida', 'pausada')),
  destaque text not null default 'laranja' check (destaque in ('laranja', 'azul', 'verde', 'violeta')),
  exibir_dashboard boolean not null default true,
  criado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (prazo is null or data_inicio is null or prazo >= data_inicio)
);

create index if not exists metas_dashboard_idx on public.metas (exibir_dashboard, status, prazo);
alter table public.metas enable row level security;

drop policy if exists "Equipe consulta metas" on public.metas;
create policy "Equipe consulta metas" on public.metas for select to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "Liderança cria metas" on public.metas;
create policy "Liderança cria metas" on public.metas for insert to authenticated
with check (
  (select auth.uid()) is not null
  and criado_por = (select auth.uid())
  and coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'financeiro')
);

drop policy if exists "Liderança atualiza metas" on public.metas;
create policy "Liderança atualiza metas" on public.metas for update to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'financeiro'))
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'financeiro'));

drop policy if exists "Liderança exclui metas" on public.metas;
create policy "Liderança exclui metas" on public.metas for delete to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'financeiro'));

revoke all on public.metas from anon;
grant select, insert, update, delete on public.metas to authenticated, service_role;
