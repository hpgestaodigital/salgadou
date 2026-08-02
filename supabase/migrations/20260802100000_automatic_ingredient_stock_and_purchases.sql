-- Reserva de insumos no planejamento, compra automática por falta/mínimo e baixa no consumo real.

alter table public.producao_lista_compras
  add column if not exists planejamento_id uuid references public.producao_planejamento(id) on delete cascade,
  add column if not exists origem_automatica boolean not null default false;

alter table public.producao_lista_compras alter column criado_por drop not null;

create table if not exists public.producao_reservas_insumos (
  planejamento_id uuid not null references public.producao_planejamento(id) on delete cascade,
  insumo_id uuid not null references public.producao_insumos(id) on delete restrict,
  quantidade_reservada numeric(14,4) not null check (quantidade_reservada > 0),
  data_producao date not null,
  updated_at timestamptz not null default now(),
  primary key (planejamento_id, insumo_id)
);

alter table public.producao_reservas_insumos enable row level security;

drop policy if exists "Produção consulta reservas" on public.producao_reservas_insumos;
create policy "Produção consulta reservas"
  on public.producao_reservas_insumos for select to authenticated
  using (
    private.usuario_pode_acessar('producao_estoque')
    or private.usuario_pode_acessar('producao_planejamento')
    or private.usuario_pode_acessar('producao_compras')
  );

grant select on public.producao_reservas_insumos to authenticated;
grant select, insert, update, delete on public.producao_reservas_insumos to service_role;

create unique index if not exists producao_compra_automatica_plano_insumo_uidx
  on public.producao_lista_compras (planejamento_id, insumo_id)
  where origem_automatica and status = 'pendente' and planejamento_id is not null;

create unique index if not exists producao_compra_automatica_minimo_insumo_uidx
  on public.producao_lista_compras (insumo_id)
  where origem_automatica and status = 'pendente' and planejamento_id is null;

create or replace function private.recalcular_reservas_e_compras()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  delete from public.producao_reservas_insumos;

  insert into public.producao_reservas_insumos (
    planejamento_id, insumo_id, quantidade_reservada, data_producao, updated_at
  )
  select
    p.id,
    r.insumo_id,
    (p.quantidade * r.quantidade_por_unidade)::numeric(14,4),
    p.data_producao,
    now()
  from public.producao_planejamento p
  join public.producao_receitas r on r.produto_id = p.produto_id
  join public.producao_insumos i on i.id = r.insumo_id and i.ativo
  where p.status = 'planejado';

  delete from public.producao_lista_compras
  where origem_automatica and status = 'pendente';

  -- Cada produção recebe somente a parcela adicional necessária para manter
  -- o saldo projetado acima do mínimo recomendado.
  insert into public.producao_lista_compras (
    planejamento_id, insumo_id, data_necessidade, quantidade_necessaria,
    quantidade_comprada, status, observacoes, origem_automatica, criado_por
  )
  with acumuladas as (
    select
      r.*,
      i.estoque_atual,
      i.estoque_minimo,
      p.criado_por,
      sum(r.quantidade_reservada) over (
        partition by r.insumo_id order by r.data_producao, r.planejamento_id
        rows between unbounded preceding and current row
      ) as reservado_acumulado,
      coalesce(sum(r.quantidade_reservada) over (
        partition by r.insumo_id order by r.data_producao, r.planejamento_id
        rows between unbounded preceding and 1 preceding
      ), 0) as reservado_anterior
    from public.producao_reservas_insumos r
    join public.producao_insumos i on i.id = r.insumo_id
    join public.producao_planejamento p on p.id = r.planejamento_id
  )
  select
    planejamento_id,
    insumo_id,
    data_producao,
    (
      greatest(reservado_acumulado + estoque_minimo - estoque_atual, 0)
      - greatest(reservado_anterior + estoque_minimo - estoque_atual, 0)
    )::numeric(14,3),
    0,
    'pendente',
    'Gerado automaticamente: estoque disponível projetado abaixo do mínimo ou insuficiente para a produção.',
    true,
    criado_por
  from acumuladas
  where greatest(reservado_acumulado + estoque_minimo - estoque_atual, 0)
      > greatest(reservado_anterior + estoque_minimo - estoque_atual, 0);

  -- Mesmo sem produção marcada, um insumo abaixo do mínimo continua visível
  -- como necessidade de reposição.
  insert into public.producao_lista_compras (
    planejamento_id, insumo_id, data_necessidade, quantidade_necessaria,
    quantidade_comprada, status, observacoes, origem_automatica, criado_por
  )
  select
    null,
    i.id,
    current_date,
    (i.estoque_minimo - i.estoque_atual)::numeric(14,3),
    0,
    'pendente',
    'Gerado automaticamente: estoque físico abaixo do mínimo recomendado.',
    true,
    null
  from public.producao_insumos i
  where i.ativo
    and i.estoque_atual < i.estoque_minimo
    and not exists (
      select 1 from public.producao_lista_compras c
      where c.origem_automatica and c.status = 'pendente' and c.insumo_id = i.id
    );
end;
$$;

revoke all on function private.recalcular_reservas_e_compras() from public, anon, authenticated;

create or replace function private.atualizar_reservas_e_compras_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.recalcular_reservas_e_compras();
  return null;
end;
$$;

revoke all on function private.atualizar_reservas_e_compras_trigger() from public, anon, authenticated;

drop trigger if exists planejamento_recalcula_compras on public.producao_planejamento;
create trigger planejamento_recalcula_compras
after insert or update of quantidade, data_producao, produto_id, status or delete
on public.producao_planejamento for each statement
execute function private.atualizar_reservas_e_compras_trigger();

drop trigger if exists receita_recalcula_compras on public.producao_receitas;
create trigger receita_recalcula_compras
after insert or update or delete on public.producao_receitas for each statement
execute function private.atualizar_reservas_e_compras_trigger();

drop trigger if exists estoque_recalcula_compras on public.producao_insumos;
create trigger estoque_recalcula_compras
after update of estoque_atual, estoque_minimo, ativo on public.producao_insumos for each statement
execute function private.atualizar_reservas_e_compras_trigger();

create or replace function private.baixar_consumo_do_estoque()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  delta numeric;
  insumo uuid;
begin
  insumo := coalesce(new.insumo_id, old.insumo_id);
  delta := case
    when tg_op = 'INSERT' then new.quantidade_utilizada
    when tg_op = 'DELETE' then -old.quantidade_utilizada
    else new.quantidade_utilizada - old.quantidade_utilizada
  end;

  update public.producao_insumos
  set estoque_atual = greatest(0, estoque_atual - delta),
      updated_at = now()
  where id = insumo;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.baixar_consumo_do_estoque() from public, anon, authenticated;

drop trigger if exists consumo_baixa_estoque on public.producao_consumos;
create trigger consumo_baixa_estoque
after insert or update of quantidade_utilizada or delete
on public.producao_consumos for each row
execute function private.baixar_consumo_do_estoque();

select private.recalcular_reservas_e_compras();
