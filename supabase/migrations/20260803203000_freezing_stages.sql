-- Separa lotes em congelamento dos já congelados e aguardando empacotamento.

alter table public.producao_lotes
  add column if not exists congelamento_iniciado_em timestamptz,
  add column if not exists congelado_em timestamptz,
  add column if not exists estimativa_porcoes numeric(14,4),
  add column if not exists congelado_por uuid references auth.users(id);

-- Remove o check anterior do status sem depender do nome gerado pelo Postgres.
do $$
declare
  constraint_name text;
begin
  select c.conname into constraint_name
  from pg_constraint c
  where c.conrelid = 'public.producao_lotes'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%congelado%empacotado%';

  if constraint_name is not null then
    execute format('alter table public.producao_lotes drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.producao_lotes
  add constraint producao_lotes_status_check
  check (status in ('em_congelamento', 'aguardando_empacotamento', 'empacotado', 'encerrado'));

-- Lotes antigos marcados apenas como congelados já estavam disponíveis para empacotamento.
update public.producao_lotes
set status = 'aguardando_empacotamento',
    congelamento_iniciado_em = coalesce(congelamento_iniciado_em, created_at),
    congelado_em = coalesce(congelado_em, updated_at)
where status = 'congelado';

create or replace function private.normalizar_novo_lote_congelamento()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  -- A RPC antiga insere como "congelado". O trigger converte para o novo primeiro estágio.
  if new.status = 'congelado' then
    new.status := 'em_congelamento';
  end if;
  if new.status = 'em_congelamento' then
    new.congelamento_iniciado_em := coalesce(new.congelamento_iniciado_em, now());
    new.congelado_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists producao_lotes_normalizar_congelamento on public.producao_lotes;
create trigger producao_lotes_normalizar_congelamento
before insert on public.producao_lotes
for each row execute function private.normalizar_novo_lote_congelamento();

create or replace function private.validar_fluxo_lote()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.status = 'empacotado' and old.status <> 'aguardando_empacotamento' then
    raise exception 'O lote precisa ser marcado como congelado antes do empacotamento';
  end if;
  return new;
end;
$$;

drop trigger if exists producao_lotes_validar_fluxo on public.producao_lotes;
create trigger producao_lotes_validar_fluxo
before update on public.producao_lotes
for each row execute function private.validar_fluxo_lote();

create or replace function public.marcar_lote_como_congelado(
  lote_id_param uuid,
  estimativa_porcoes_param numeric default null,
  observacoes_param text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  lote_status text;
begin
  if (select auth.uid()) is null
    or not private.usuario_pode_acessar('producao_planejamento') then
    raise exception 'Acesso negado';
  end if;

  if estimativa_porcoes_param is not null and estimativa_porcoes_param <= 0 then
    raise exception 'A estimativa de porções deve ser maior que zero';
  end if;

  select status into lote_status
  from public.producao_lotes
  where id = lote_id_param
  for update;

  if lote_status is null then raise exception 'Lote não encontrado'; end if;
  if lote_status <> 'em_congelamento' then
    raise exception 'Este lote não está em congelamento';
  end if;

  update public.producao_lotes
  set status = 'aguardando_empacotamento',
      congelado_em = now(),
      congelado_por = (select auth.uid()),
      estimativa_porcoes = estimativa_porcoes_param,
      observacoes = case
        when nullif(btrim(observacoes_param), '') is null then observacoes
        when observacoes is null then 'Congelamento: ' || btrim(observacoes_param)
        else observacoes || E'\nCongelamento: ' || btrim(observacoes_param)
      end,
      updated_at = now()
  where id = lote_id_param;
end;
$$;

revoke all on function public.marcar_lote_como_congelado(uuid, numeric, text) from public;
grant execute on function public.marcar_lote_como_congelado(uuid, numeric, text) to authenticated;
