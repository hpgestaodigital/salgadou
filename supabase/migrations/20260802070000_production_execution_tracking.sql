-- Execução da produção, consumo real e sincronização bidirecional com o Kanban.

alter table public.producao_planejamento
  add column if not exists pre_preparo_necessario boolean not null default false,
  add column if not exists pre_preparo_tarefa_id uuid references public.kanban_tarefas(id) on delete set null,
  add column if not exists pre_preparo_status text not null default 'nao_realizado'
    check (pre_preparo_status in ('nao_realizado','em_andamento','concluido')),
  add column if not exists pre_preparo_concluido_em timestamptz,
  add column if not exists quantidade_produzida numeric(14,3) check (quantidade_produzida >= 0),
  add column if not exists concluido_em timestamptz,
  add column if not exists concluido_por uuid references auth.users(id) on delete set null,
  add column if not exists observacoes_fechamento text;

create table if not exists public.producao_consumos (
  planejamento_id uuid not null references public.producao_planejamento(id) on delete cascade,
  insumo_id uuid not null references public.producao_insumos(id) on delete restrict,
  quantidade_planejada numeric(14,4) not null default 0 check (quantidade_planejada >= 0),
  quantidade_utilizada numeric(14,4) not null check (quantidade_utilizada >= 0),
  registrado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (planejamento_id, insumo_id)
);

alter table public.producao_consumos enable row level security;

drop policy if exists "Produção consulta consumos" on public.producao_consumos;
create policy "Produção consulta consumos"
  on public.producao_consumos for select to authenticated
  using (
    private.usuario_pode_acessar('producao_planejamento')
    or private.usuario_pode_acessar('dashboard_calendario_producao')
  );

drop policy if exists "Produção gerencia consumos" on public.producao_consumos;
create policy "Produção gerencia consumos"
  on public.producao_consumos for all to authenticated
  using (private.usuario_pode_acessar('producao_planejamento'))
  with check (private.usuario_pode_acessar('producao_planejamento'));

grant select, insert, update, delete on public.producao_consumos to authenticated, service_role;

create or replace function private.sincronizar_pre_preparo_do_kanban()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update public.producao_planejamento
  set pre_preparo_status = case
        when new.status = 'concluido' then 'concluido'
        when new.status = 'em_andamento' then 'em_andamento'
        else 'nao_realizado'
      end,
      pre_preparo_concluido_em = case when new.status = 'concluido' then coalesce(pre_preparo_concluido_em, now()) else null end,
      updated_at = now()
  where pre_preparo_tarefa_id = new.id;
  return new;
end;
$$;

revoke all on function private.sincronizar_pre_preparo_do_kanban() from public, anon, authenticated;

drop trigger if exists kanban_sincroniza_pre_preparo on public.kanban_tarefas;
create trigger kanban_sincroniza_pre_preparo
after update of status on public.kanban_tarefas
for each row
when (old.status is distinct from new.status)
execute function private.sincronizar_pre_preparo_do_kanban();

create or replace function public.definir_status_pre_preparo(
  planejamento_id_param uuid,
  status_param text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  tarefa_id uuid;
begin
  if (select auth.uid()) is null
    or not private.usuario_pode_acessar('producao_planejamento') then
    raise exception 'Acesso negado';
  end if;
  if status_param not in ('nao_realizado','em_andamento','concluido') then
    raise exception 'Status inválido';
  end if;

  select pre_preparo_tarefa_id into tarefa_id
  from public.producao_planejamento
  where id = planejamento_id_param and pre_preparo_necessario;

  if tarefa_id is null then raise exception 'Pré-preparo não vinculado'; end if;

  update public.kanban_tarefas
  set status = status_param
  where id = tarefa_id;

  update public.producao_planejamento
  set pre_preparo_status = status_param,
      pre_preparo_concluido_em = case when status_param = 'concluido' then coalesce(pre_preparo_concluido_em, now()) else null end,
      updated_at = now()
  where id = planejamento_id_param;
end;
$$;

revoke all on function public.definir_status_pre_preparo(uuid, text) from public, anon;
grant execute on function public.definir_status_pre_preparo(uuid, text) to authenticated, service_role;

create or replace function public.concluir_producao(
  planejamento_id_param uuid,
  quantidade_produzida_param numeric,
  observacoes_param text,
  consumos_param jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  consumo jsonb;
  produto_do_plano uuid;
begin
  if (select auth.uid()) is null
    or not private.usuario_pode_acessar('producao_planejamento') then
    raise exception 'Acesso negado';
  end if;
  if quantidade_produzida_param is null or quantidade_produzida_param < 0 then
    raise exception 'Quantidade produzida inválida';
  end if;

  select produto_id into produto_do_plano
  from public.producao_planejamento
  where id = planejamento_id_param
  for update;
  if produto_do_plano is null then raise exception 'Produção não encontrada'; end if;

  for consumo in select value from jsonb_array_elements(coalesce(consumos_param, '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.producao_receitas
      where produto_id = produto_do_plano
        and insumo_id = (consumo ->> 'insumo_id')::uuid
    ) then
      raise exception 'Insumo não pertence à receita desta produção';
    end if;
    insert into public.producao_consumos (
      planejamento_id, insumo_id, quantidade_planejada, quantidade_utilizada, registrado_por, updated_at
    ) values (
      planejamento_id_param,
      (consumo ->> 'insumo_id')::uuid,
      greatest(0, coalesce((consumo ->> 'quantidade_planejada')::numeric, 0)),
      greatest(0, coalesce((consumo ->> 'quantidade_utilizada')::numeric, 0)),
      (select auth.uid()),
      now()
    )
    on conflict (planejamento_id, insumo_id) do update
    set quantidade_planejada = excluded.quantidade_planejada,
        quantidade_utilizada = excluded.quantidade_utilizada,
        registrado_por = excluded.registrado_por,
        updated_at = now();
  end loop;

  update public.producao_planejamento
  set status = 'concluido',
      quantidade_produzida = quantidade_produzida_param,
      observacoes_fechamento = nullif(btrim(observacoes_param), ''),
      concluido_em = now(),
      concluido_por = (select auth.uid()),
      updated_at = now()
  where id = planejamento_id_param;
end;
$$;

revoke all on function public.concluir_producao(uuid, numeric, text, jsonb) from public, anon;
grant execute on function public.concluir_producao(uuid, numeric, text, jsonb) to authenticated, service_role;

create index if not exists producao_planejamento_preparo_tarefa_idx
  on public.producao_planejamento (pre_preparo_tarefa_id)
  where pre_preparo_tarefa_id is not null;
