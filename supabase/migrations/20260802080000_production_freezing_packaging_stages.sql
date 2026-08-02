-- Produção em duas etapas: saída da máquina/congelamento e empacotamento.

alter table public.producao_planejamento
  add column if not exists caixas_produzidas numeric(14,3) check (caixas_produzidas >= 0),
  add column if not exists saida_maquina_em timestamptz,
  add column if not exists caixas_empacotadas numeric(14,3) check (caixas_empacotadas >= 0),
  add column if not exists porcoes_empacotadas numeric(14,3) check (porcoes_empacotadas >= 0),
  add column if not exists empacotamento_em timestamptz;

create or replace function public.registrar_saida_maquina(
  planejamento_id_param uuid,
  estimativa_unidades_param numeric,
  caixas_produzidas_param numeric,
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
  if estimativa_unidades_param is null or estimativa_unidades_param < 0 then
    raise exception 'Estimativa da máquina inválida';
  end if;
  if caixas_produzidas_param is null or caixas_produzidas_param < 0 then
    raise exception 'Quantidade de caixas inválida';
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
  set status = 'em_producao',
      quantidade_produzida = estimativa_unidades_param,
      caixas_produzidas = caixas_produzidas_param,
      observacoes_fechamento = nullif(btrim(observacoes_param), ''),
      saida_maquina_em = now(),
      concluido_em = null,
      concluido_por = null,
      updated_at = now()
  where id = planejamento_id_param;
end;
$$;

revoke all on function public.registrar_saida_maquina(uuid, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.registrar_saida_maquina(uuid, numeric, numeric, text, jsonb) to authenticated, service_role;

create or replace function public.concluir_empacotamento(
  planejamento_id_param uuid,
  caixas_empacotadas_param numeric,
  porcoes_empacotadas_param numeric,
  observacoes_param text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  caixas_disponiveis numeric;
begin
  if (select auth.uid()) is null
    or not private.usuario_pode_acessar('producao_planejamento') then
    raise exception 'Acesso negado';
  end if;
  if caixas_empacotadas_param is null or caixas_empacotadas_param < 0
    or porcoes_empacotadas_param is null or porcoes_empacotadas_param < 0 then
    raise exception 'Quantidades de empacotamento inválidas';
  end if;

  select caixas_produzidas into caixas_disponiveis
  from public.producao_planejamento
  where id = planejamento_id_param and status = 'em_producao'
  for update;
  if caixas_disponiveis is null then raise exception 'Registre primeiro a saída da máquina'; end if;
  if caixas_empacotadas_param > caixas_disponiveis then
    raise exception 'As caixas empacotadas não podem superar as caixas produzidas';
  end if;

  update public.producao_planejamento
  set status = 'concluido',
      caixas_empacotadas = caixas_empacotadas_param,
      porcoes_empacotadas = porcoes_empacotadas_param,
      observacoes_fechamento = case
        when nullif(btrim(observacoes_param), '') is null then observacoes_fechamento
        when observacoes_fechamento is null then btrim(observacoes_param)
        else observacoes_fechamento || E'\nEmpacotamento: ' || btrim(observacoes_param)
      end,
      empacotamento_em = now(),
      concluido_em = now(),
      concluido_por = (select auth.uid()),
      updated_at = now()
  where id = planejamento_id_param;
end;
$$;

revoke all on function public.concluir_empacotamento(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.concluir_empacotamento(uuid, numeric, numeric, text) to authenticated, service_role;
