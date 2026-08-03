-- Mantém o resumo de estoque final alinhado ao saldo disponível dos lotes.
create or replace function public.registrar_retirada_salgadinhos(
  produto_id_param uuid,
  lote_id_param uuid default null,
  quantidade_param numeric default null,
  unidade_param text default 'porcao',
  unidades_por_porcao_param numeric default null,
  motivo_param text default 'vendido',
  data_param date default current_date,
  observacoes_param text default null
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  restante numeric(14,4);
  solicitado_porcoes numeric(14,4);
  baixar numeric(14,4);
  lote record;
  saldo_antes numeric(14,4);
  total_disponivel numeric(14,4);
begin
  if auth.uid() is null or not (
    private.usuario_pode_acessar('producao_estoque')
    or private.usuario_pode_acessar('producao_planejamento')
  ) then
    raise exception 'Acesso negado';
  end if;

  if quantidade_param is null or quantidade_param <= 0 then
    raise exception 'Informe uma quantidade maior que zero';
  end if;

  if unidade_param not in ('porcao', 'unidade') then
    raise exception 'Unidade inválida';
  end if;

  if motivo_param not in ('vendido', 'perda', 'consumo_interno', 'ajuste') then
    raise exception 'Motivo inválido';
  end if;

  if unidade_param = 'unidade'
     and (unidades_por_porcao_param is null or unidades_por_porcao_param <= 0) then
    raise exception 'Informe quantas unidades formam uma porção';
  end if;

  solicitado_porcoes := case
    when unidade_param = 'porcao' then quantidade_param
    else quantidade_param / unidades_por_porcao_param
  end;
  restante := solicitado_porcoes;

  select coalesce(sum(porcoes_disponiveis), 0)
  into total_disponivel
  from public.producao_lotes
  where produto_id = produto_id_param
    and status = 'empacotado'
    and porcoes_disponiveis > 0
    and (lote_id_param is null or id = lote_id_param);

  if total_disponivel < solicitado_porcoes then
    raise exception 'Saldo insuficiente. Disponível: % porções', total_disponivel;
  end if;

  for lote in
    select id, porcoes_disponiveis
    from public.producao_lotes
    where produto_id = produto_id_param
      and status = 'empacotado'
      and porcoes_disponiveis > 0
      and (lote_id_param is null or id = lote_id_param)
    order by data_producao asc, created_at asc
    for update
  loop
    exit when restante <= 0;
    saldo_antes := lote.porcoes_disponiveis;
    baixar := least(restante, saldo_antes);

    update public.producao_lotes
    set porcoes_disponiveis = saldo_antes - baixar,
        status = case when saldo_antes - baixar = 0 then 'encerrado' else status end,
        updated_at = now()
    where id = lote.id;

    insert into public.producao_movimentacoes_salgadinhos(
      produto_id,
      lote_id,
      motivo,
      unidade_informada,
      quantidade_informada,
      unidades_por_porcao,
      porcoes_baixadas,
      saldo_anterior,
      saldo_posterior,
      data_movimentacao,
      observacoes,
      criado_por
    ) values (
      produto_id_param,
      lote.id,
      motivo_param,
      unidade_param,
      case
        when unidade_param = 'porcao' then baixar
        else baixar * unidades_por_porcao_param
      end,
      unidades_por_porcao_param,
      baixar,
      saldo_antes,
      saldo_antes - baixar,
      coalesce(data_param, current_date),
      nullif(btrim(observacoes_param), ''),
      auth.uid()
    );

    restante := restante - baixar;
  end loop;

  -- O resumo exibido pela tela precisa refletir o saldo atual dos lotes,
  -- não a quantidade originalmente empacotada.
  insert into public.producao_estoque_final(
    produto_id,
    caixas_congeladas,
    porcoes_empacotadas,
    updated_at
  ) values (
    produto_id_param,
    0,
    (
      select coalesce(sum(porcoes_disponiveis), 0)
      from public.producao_lotes
      where produto_id = produto_id_param
    ),
    now()
  )
  on conflict (produto_id) do update
  set porcoes_empacotadas = excluded.porcoes_empacotadas,
      updated_at = now();

  return solicitado_porcoes;
end;
$$;

notify pgrst, 'reload schema';
