-- A saída da máquina consome massa e recheio da ficha vinculada, ou mantém o fluxo legado quando não houver ficha.
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
  plano record;
  codigo_lote text;
  ficha_id uuid;
begin
  if auth.uid() is null or not private.usuario_pode_acessar('producao_planejamento') then
    raise exception 'Acesso negado';
  end if;
  if estimativa_unidades_param is null or estimativa_unidades_param <= 0 then
    raise exception 'Informe uma quantidade produzida maior que zero';
  end if;
  if caixas_produzidas_param is null or caixas_produzidas_param <= 0 then
    raise exception 'Informe quantas caixas foram produzidas';
  end if;

  select p.id,p.produto_id,p.data_producao,p.quantidade,p.status,pr.ficha_tecnica_id
  into plano
  from public.producao_planejamento p
  join public.producao_produtos pr on pr.id=p.produto_id
  where p.id=planejamento_id_param
  for update of p;

  if plano.id is null then raise exception 'Produção não encontrada'; end if;
  if plano.status <> 'planejado' then raise exception 'A saída da máquina já foi registrada para esta produção'; end if;
  ficha_id := plano.ficha_tecnica_id;

  if ficha_id is not null then
    perform public.registrar_consumo_salgado(
      ficha_id,
      estimativa_unidades_param,
      planejamento_id_param,
      observacoes_param
    );
  else
    for consumo in select value from jsonb_array_elements(coalesce(consumos_param,'[]'::jsonb)) loop
      if not exists (
        select 1 from public.producao_receitas
        where produto_id=plano.produto_id and insumo_id=(consumo->>'insumo_id')::uuid
      ) then raise exception 'Insumo não pertence à receita desta produção'; end if;

      insert into public.producao_consumos(
        planejamento_id,insumo_id,quantidade_planejada,quantidade_utilizada,registrado_por,updated_at
      ) values (
        planejamento_id_param,(consumo->>'insumo_id')::uuid,
        greatest(0,coalesce((consumo->>'quantidade_planejada')::numeric,0)),
        greatest(0,coalesce((consumo->>'quantidade_utilizada')::numeric,0)),auth.uid(),now()
      ) on conflict(planejamento_id,insumo_id) do update set
        quantidade_planejada=excluded.quantidade_planejada,
        quantidade_utilizada=excluded.quantidade_utilizada,
        registrado_por=excluded.registrado_por,
        updated_at=now();
    end loop;
  end if;

  codigo_lote:=public.gerar_codigo_lote(plano.data_producao,plano.produto_id);
  insert into public.producao_lotes(
    codigo,planejamento_id,produto_id,data_producao,status,
    quantidade_planejada,quantidade_saida_maquina,caixas_produzidas,observacoes,criado_por
  ) values (
    codigo_lote,plano.id,plano.produto_id,plano.data_producao,'em_congelamento',
    plano.quantidade,estimativa_unidades_param,caixas_produzidas_param,
    nullif(btrim(observacoes_param),''),auth.uid()
  );

  update public.producao_planejamento set
    status='em_producao',quantidade_produzida=estimativa_unidades_param,
    caixas_produzidas=caixas_produzidas_param,observacoes_fechamento=nullif(btrim(observacoes_param),''),
    saida_maquina_em=now(),concluido_em=null,concluido_por=null,updated_at=now()
  where id=planejamento_id_param;
end;
$$;

revoke all on function public.registrar_saida_maquina(uuid,numeric,numeric,text,jsonb) from public;
grant execute on function public.registrar_saida_maquina(uuid,numeric,numeric,text,jsonb) to authenticated;