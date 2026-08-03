-- Histórico de lançamentos das metas.
-- Cada lançamento soma ao acumulado e preserva o total após a operação.

create table if not exists public.meta_lancamentos (
  id                uuid primary key default gen_random_uuid(),
  meta_id           uuid not null references public.metas(id) on delete cascade,
  data_lancamento   date not null default current_date,
  valor_lancado     numeric not null check (valor_lancado > 0),
  total_acumulado   numeric not null check (total_acumulado >= 0),
  criado_por        uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at        timestamptz not null default now()
);

create index if not exists meta_lancamentos_meta_data_idx
  on public.meta_lancamentos (meta_id, data_lancamento desc, created_at desc);

alter table public.meta_lancamentos enable row level security;

drop policy if exists "Equipe consulta lançamentos de metas" on public.meta_lancamentos;
create policy "Equipe consulta lançamentos de metas"
  on public.meta_lancamentos for select to authenticated
  using ((select auth.uid()) is not null);

-- O histórico é imutável pelo frontend. Novos registros entram apenas pela RPC.
revoke all on public.meta_lancamentos from anon, authenticated;
grant select on public.meta_lancamentos to authenticated, service_role;
grant all on public.meta_lancamentos to service_role;

-- Preserva o valor atual já existente como primeiro registro histórico.
insert into public.meta_lancamentos (
  meta_id,
  data_lancamento,
  valor_lancado,
  total_acumulado,
  criado_por,
  created_at
)
select
  m.id,
  coalesce(m.data_inicio, m.created_at::date),
  m.valor_atual,
  m.valor_atual,
  m.criado_por,
  m.created_at
from public.metas m
where m.valor_atual > 0
  and not exists (
    select 1 from public.meta_lancamentos l where l.meta_id = m.id
  );

create or replace function public.registrar_lancamento_meta(
  p_meta_id uuid,
  p_valor numeric,
  p_data_lancamento date default current_date
)
returns public.meta_lancamentos
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_papel text := coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '');
  v_total numeric;
  v_lancamento public.meta_lancamentos;
begin
  if v_usuario_id is null or v_papel not in ('admin', 'socio', 'financeiro') then
    raise exception 'Acesso negado';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor lançado deve ser maior que zero';
  end if;

  if p_data_lancamento is null then
    raise exception 'A data do lançamento é obrigatória';
  end if;

  select valor_atual
    into v_total
  from public.metas
  where id = p_meta_id
  for update;

  if not found then
    raise exception 'Meta não encontrada';
  end if;

  v_total := coalesce(v_total, 0) + p_valor;

  update public.metas
  set valor_atual = v_total,
      updated_at = now()
  where id = p_meta_id;

  insert into public.meta_lancamentos (
    meta_id,
    data_lancamento,
    valor_lancado,
    total_acumulado,
    criado_por
  ) values (
    p_meta_id,
    p_data_lancamento,
    p_valor,
    v_total,
    v_usuario_id
  )
  returning * into v_lancamento;

  return v_lancamento;
end;
$$;

revoke all on function public.registrar_lancamento_meta(uuid, numeric, date)
  from public, anon;
grant execute on function public.registrar_lancamento_meta(uuid, numeric, date)
  to authenticated, service_role;

-- Retira a edição direta de valor_atual pelo papel authenticated.
-- Os demais campos continuam editáveis pela tela de Metas.
revoke update on public.metas from authenticated;
grant update (
  titulo,
  descricao,
  valor_meta,
  unidade,
  data_inicio,
  prazo,
  status,
  destaque,
  exibir_dashboard,
  updated_at
) on public.metas to authenticated;
