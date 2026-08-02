-- Estoque automático de caixas congeladas e porções empacotadas por produto.

create table if not exists public.producao_estoque_final (
  produto_id uuid primary key references public.producao_produtos(id) on delete cascade,
  caixas_congeladas numeric(14,3) not null default 0 check (caixas_congeladas >= 0),
  porcoes_empacotadas numeric(14,3) not null default 0 check (porcoes_empacotadas >= 0),
  updated_at timestamptz not null default now()
);

alter table public.producao_estoque_final enable row level security;

drop policy if exists "Estoque final consulta autorizada" on public.producao_estoque_final;
create policy "Estoque final consulta autorizada"
  on public.producao_estoque_final for select to authenticated
  using (
    private.usuario_pode_acessar('producao_estoque')
    or private.usuario_pode_acessar('producao_planejamento')
  );

grant select on public.producao_estoque_final to authenticated;
grant select, insert, update, delete on public.producao_estoque_final to service_role;

create or replace function private.sincronizar_estoque_final()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  produto uuid;
  delta_caixas numeric;
  delta_porcoes numeric;
begin
  produto := coalesce(new.produto_id, old.produto_id);
  delta_caixas :=
    (coalesce(new.caixas_produzidas, 0) - coalesce(new.caixas_empacotadas, 0))
    - (coalesce(old.caixas_produzidas, 0) - coalesce(old.caixas_empacotadas, 0));
  delta_porcoes := coalesce(new.porcoes_empacotadas, 0) - coalesce(old.porcoes_empacotadas, 0);

  insert into public.producao_estoque_final (produto_id, caixas_congeladas, porcoes_empacotadas, updated_at)
  values (produto, greatest(0, delta_caixas), greatest(0, delta_porcoes), now())
  on conflict (produto_id) do update
  set caixas_congeladas = greatest(0, public.producao_estoque_final.caixas_congeladas + delta_caixas),
      porcoes_empacotadas = greatest(0, public.producao_estoque_final.porcoes_empacotadas + delta_porcoes),
      updated_at = now();
  return new;
end;
$$;

revoke all on function private.sincronizar_estoque_final() from public, anon, authenticated;

drop trigger if exists planejamento_sincroniza_estoque_final on public.producao_planejamento;
create trigger planejamento_sincroniza_estoque_final
after update of caixas_produzidas, caixas_empacotadas, porcoes_empacotadas
on public.producao_planejamento
for each row
when (
  old.caixas_produzidas is distinct from new.caixas_produzidas
  or old.caixas_empacotadas is distinct from new.caixas_empacotadas
  or old.porcoes_empacotadas is distinct from new.porcoes_empacotadas
)
execute function private.sincronizar_estoque_final();

-- Inicializa o estoque com produções já registradas antes desta atualização.
insert into public.producao_estoque_final (produto_id, caixas_congeladas, porcoes_empacotadas, updated_at)
select
  produto_id,
  greatest(0, sum(coalesce(caixas_produzidas, 0) - coalesce(caixas_empacotadas, 0))),
  greatest(0, sum(coalesce(porcoes_empacotadas, 0))),
  now()
from public.producao_planejamento
where caixas_produzidas is not null or porcoes_empacotadas is not null
group by produto_id
on conflict (produto_id) do update
set caixas_congeladas = excluded.caixas_congeladas,
    porcoes_empacotadas = excluded.porcoes_empacotadas,
    updated_at = now();
