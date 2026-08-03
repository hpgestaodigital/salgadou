-- Usa o ledger central de estoque nas produções de preparos e molhos.
-- O ledger trabalha com quantidade assinada: entradas positivas e saídas negativas.

create or replace function public.registrar_producao_preparo(
  ficha_id_param uuid,
  receitas_param numeric,
  quantidade_real_param numeric,
  unidade_param text,
  data_param date default current_date,
  observacoes_param text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  ficha record;
  item record;
  insumo record;
  necessario numeric(14,4);
  necessario_insumo numeric(14,4);
  lote_id uuid;
  lote_codigo text;
begin
  if auth.uid() is null or not (
    private.usuario_pode_acessar('producao_estoque')
    or private.usuario_pode_acessar('producao_planejamento')
  ) then
    raise exception 'Acesso negado';
  end if;

  if receitas_param is null or receitas_param <= 0
     or quantidade_real_param is null or quantidade_real_param <= 0 then
    raise exception 'Informe receitas e rendimento real';
  end if;

  select * into ficha
  from public.producao_fichas_tecnicas
  where id = ficha_id_param
    and categoria in ('massa','recheio')
    and ativo;

  if not found then
    raise exception 'Ficha de massa ou recheio não encontrada';
  end if;

  perform private.converter_unidade_producao(
    quantidade_real_param,
    unidade_param,
    ficha.unidade_rendimento
  );

  if not exists (
    select 1 from public.producao_ficha_itens where ficha_id = ficha_id_param
  ) then
    raise exception 'Cadastre os ingredientes ou componentes antes de produzir';
  end if;

  for item in
    select *
    from public.producao_ficha_itens
    where ficha_id = ficha_id_param
    order by created_at, id
  loop
    necessario := item.quantidade * receitas_param;

    if item.insumo_id is not null then
      select * into insumo
      from public.producao_insumos
      where id = item.insumo_id
      for update;

      if not found or not insumo.ativo then
        raise exception 'Insumo da ficha não encontrado ou inativo';
      end if;

      if insumo.controla_estoque then
        necessario_insumo := private.converter_unidade_producao(
          necessario,
          item.unidade,
          insumo.unidade
        );

        if insumo.estoque_atual < necessario_insumo then
          raise exception 'Saldo insuficiente de %. Necessário: % %, disponível: % %',
            insumo.nome,
            necessario_insumo,
            insumo.unidade,
            insumo.estoque_atual,
            insumo.unidade;
        end if;

        perform private.aplicar_movimentacao_estoque(
          insumo.id,
          -necessario_insumo,
          'saida_producao',
          'producao_preparo',
          ficha_id_param,
          'Produção de ' || ficha.nome,
          nullif(btrim(observacoes_param), ''),
          null,
          auth.uid(),
          true
        );
      end if;
    else
      perform private.consumir_preparo_fifo(
        item.componente_ficha_id,
        necessario,
        item.unidade,
        'producao_preparo',
        ficha_id_param,
        'Componente utilizado na produção de ' || ficha.nome,
        observacoes_param
      );
    end if;
  end loop;

  lote_codigo := 'PRE-'
    || to_char(coalesce(data_param, current_date), 'YYYYMMDD')
    || '-'
    || upper(substr(replace(ficha.nome, ' ', ''), 1, 4))
    || '-'
    || substr(gen_random_uuid()::text, 1, 4);

  insert into public.producao_preparos_lotes(
    ficha_id,
    codigo,
    data_producao,
    receitas_produzidas,
    quantidade_prevista,
    quantidade_produzida,
    quantidade_disponivel,
    unidade,
    observacoes,
    criado_por
  ) values (
    ficha_id_param,
    lote_codigo,
    coalesce(data_param, current_date),
    receitas_param,
    ficha.rendimento_padrao * receitas_param,
    quantidade_real_param,
    quantidade_real_param,
    unidade_param,
    nullif(btrim(observacoes_param), ''),
    auth.uid()
  ) returning id into lote_id;

  insert into public.producao_preparos_movimentacoes(
    ficha_id,
    lote_id,
    tipo,
    quantidade,
    unidade,
    saldo_anterior,
    saldo_posterior,
    origem_tipo,
    origem_id,
    motivo,
    observacoes,
    criado_por
  ) values (
    ficha_id_param,
    lote_id,
    'entrada',
    quantidade_real_param,
    unidade_param,
    0,
    quantidade_real_param,
    'producao_preparo',
    lote_id,
    'Produção de ' || ficha.nome,
    nullif(btrim(observacoes_param), ''),
    auth.uid()
  );

  return lote_id;
end;
$$;

create or replace function public.registrar_producao_molho(
  ficha_id_param uuid,
  receitas_param numeric,
  data_param date,
  grandes_param integer,
  pequenas_param integer,
  observacoes_param text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  ficha record;
  item record;
  necessario numeric(14,4);
  necessario_insumo numeric(14,4);
  saldo numeric(14,4);
  lote_id uuid;
  lote_codigo text;
begin
  if auth.uid() is null or not (
    private.usuario_pode_acessar('producao_estoque')
    or private.usuario_pode_acessar('producao_planejamento')
  ) then
    raise exception 'Acesso negado';
  end if;

  if receitas_param is null or receitas_param <= 0 then
    raise exception 'Informe quantas receitas foram produzidas';
  end if;

  if coalesce(grandes_param, 0) < 0
     or coalesce(pequenas_param, 0) < 0
     or coalesce(grandes_param, 0) + coalesce(pequenas_param, 0) <= 0 then
    raise exception 'Informe as bisnagas produzidas';
  end if;

  select * into ficha
  from public.producao_fichas_tecnicas
  where id = ficha_id_param
    and categoria = 'molho'
    and ativo;

  if not found then
    raise exception 'Ficha técnica de molho não encontrada';
  end if;

  if exists (
    select 1
    from public.producao_ficha_itens
    where ficha_id = ficha_id_param
      and componente_ficha_id is not null
  ) then
    raise exception 'A produção de molho aceita apenas insumos';
  end if;

  if not exists (
    select 1 from public.producao_ficha_itens where ficha_id = ficha_id_param
  ) then
    raise exception 'Cadastre os ingredientes antes de produzir';
  end if;

  for item in
    select
      fi.*,
      i.nome,
      i.unidade as unidade_insumo,
      i.estoque_atual,
      i.controla_estoque,
      i.ativo
    from public.producao_ficha_itens fi
    join public.producao_insumos i on i.id = fi.insumo_id
    where fi.ficha_id = ficha_id_param
    order by fi.created_at, fi.id
  loop
    if not item.ativo then
      raise exception 'Insumo % está inativo', item.nome;
    end if;

    if item.controla_estoque then
      select estoque_atual into saldo
      from public.producao_insumos
      where id = item.insumo_id
      for update;

      necessario := item.quantidade * receitas_param;
      necessario_insumo := private.converter_unidade_producao(
        necessario,
        item.unidade,
        item.unidade_insumo
      );

      if saldo < necessario_insumo then
        raise exception 'Saldo insuficiente de %. Necessário: % %, disponível: % %',
          item.nome,
          necessario_insumo,
          item.unidade_insumo,
          saldo,
          item.unidade_insumo;
      end if;

      perform private.aplicar_movimentacao_estoque(
        item.insumo_id,
        -necessario_insumo,
        'saida_producao',
        'producao_molho',
        ficha_id_param,
        'Produção de ' || ficha.nome,
        nullif(btrim(observacoes_param), ''),
        null,
        auth.uid(),
        true
      );
    end if;
  end loop;

  lote_codigo := 'MOL-'
    || to_char(coalesce(data_param, current_date), 'YYYYMMDD')
    || '-'
    || upper(substr(replace(ficha.nome, ' ', ''), 1, 4))
    || '-'
    || substr(gen_random_uuid()::text, 1, 4);

  insert into public.producao_molho_lotes(
    ficha_id,
    codigo,
    data_producao,
    receitas_produzidas,
    rendimento_esperado,
    bisnagas_grandes,
    bisnagas_pequenas,
    bisnagas_grandes_disponiveis,
    bisnagas_pequenas_disponiveis,
    observacoes,
    criado_por
  ) values (
    ficha_id_param,
    lote_codigo,
    coalesce(data_param, current_date),
    receitas_param,
    ficha.rendimento_padrao * receitas_param,
    coalesce(grandes_param, 0),
    coalesce(pequenas_param, 0),
    coalesce(grandes_param, 0),
    coalesce(pequenas_param, 0),
    nullif(btrim(observacoes_param), ''),
    auth.uid()
  ) returning id into lote_id;

  if coalesce(grandes_param, 0) > 0 then
    insert into public.producao_molho_movimentacoes(
      ficha_id,lote_id,tamanho,tipo,quantidade,saldo_anterior,saldo_posterior,
      motivo,data_movimentacao,observacoes,criado_por
    ) values (
      ficha_id_param,lote_id,'grande','entrada',grandes_param,0,grandes_param,
      'Produção de ' || ficha.nome,coalesce(data_param,current_date),
      nullif(btrim(observacoes_param),''),auth.uid()
    );
  end if;

  if coalesce(pequenas_param, 0) > 0 then
    insert into public.producao_molho_movimentacoes(
      ficha_id,lote_id,tamanho,tipo,quantidade,saldo_anterior,saldo_posterior,
      motivo,data_movimentacao,observacoes,criado_por
    ) values (
      ficha_id_param,lote_id,'pequena','entrada',pequenas_param,0,pequenas_param,
      'Produção de ' || ficha.nome,coalesce(data_param,current_date),
      nullif(btrim(observacoes_param),''),auth.uid()
    );
  end if;

  return lote_id;
end;
$$;

notify pgrst, 'reload schema';
