create or replace function public.registrar_lancamento_meta(
  p_meta_id uuid,
  p_valor numeric,
  p_data_lancamento date default current_date
)
returns public.meta_lancamentos
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_usuario_id uuid := (select auth.uid());
  v_lancamento public.meta_lancamentos;
begin
  if v_usuario_id is null or not private.usuario_pode_acessar('metas') then
    raise exception 'Acesso negado';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor lançado deve ser maior que zero';
  end if;
  if p_data_lancamento is null then
    raise exception 'A data do lançamento é obrigatória';
  end if;

  perform 1 from public.metas where id = p_meta_id for update;
  if not found then raise exception 'Meta não encontrada'; end if;

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
    0,
    v_usuario_id
  ) returning * into v_lancamento;

  with acumulados as (
    select
      id,
      sum(valor_lancado) over (
        partition by meta_id
        order by data_lancamento, created_at, id
        rows between unbounded preceding and current row
      ) as total_correto
    from public.meta_lancamentos
    where meta_id = p_meta_id
  )
  update public.meta_lancamentos lancamento
  set total_acumulado = acumulados.total_correto
  from acumulados
  where lancamento.id = acumulados.id;

  update public.metas
  set
    valor_atual = coalesce((
      select sum(valor_lancado)
      from public.meta_lancamentos
      where meta_id = p_meta_id
    ), 0),
    updated_at = now()
  where id = p_meta_id;

  select * into v_lancamento
  from public.meta_lancamentos
  where id = v_lancamento.id;

  return v_lancamento;
end;
$function$;

-- Corrige os acumulados históricos já existentes pela data informada pelo usuário.
with acumulados as (
  select
    id,
    sum(valor_lancado) over (
      partition by meta_id
      order by data_lancamento, created_at, id
      rows between unbounded preceding and current row
    ) as total_correto
  from public.meta_lancamentos
)
update public.meta_lancamentos lancamento
set total_acumulado = acumulados.total_correto
from acumulados
where lancamento.id = acumulados.id;

update public.metas meta
set
  valor_atual = coalesce((
    select sum(lancamento.valor_lancado)
    from public.meta_lancamentos lancamento
    where lancamento.meta_id = meta.id
  ), 0),
  updated_at = now();
