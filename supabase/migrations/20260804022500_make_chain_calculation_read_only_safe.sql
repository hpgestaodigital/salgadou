-- Permite consultar as necessidades de produção pelo PostgREST via GET.
-- A versão anterior criava tabelas temporárias, operação bloqueada nas
-- transações somente leitura usadas pelo PostgREST para views.

create or replace function public.calcular_necessidades_producao()
returns table (
  data_producao date,
  insumo_id uuid,
  insumo text,
  unidade text,
  quantidade_necessaria numeric,
  estoque_atual numeric,
  quantidade_a_comprar numeric
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  plano record;
  fila_item jsonb;
  item record;
  componente record;
  ins record;
  necessario numeric(18,6);
  necessario_base numeric(18,6);
  disponivel numeric(18,6);
  utilizado numeric(18,6);
  falta numeric(18,6);
  receitas_atual numeric(18,8);
  data_atual date;
  ficha_atual uuid;
  caminho jsonb;
  chave text;
  resultado_chave text;
  necessario_acumulado numeric(18,6);
  comprar_acumulado numeric(18,6);
  estoques jsonb := '{}'::jsonb;
  fila jsonb := '[]'::jsonb;
  resultados jsonb := '{}'::jsonb;
begin
  if auth.uid() is null
    or not (
      private.usuario_pode_acessar('producao_planejamento')
      or private.usuario_pode_acessar('producao_compras')
      or private.usuario_pode_acessar('producao_estoque')
    ) then
    raise exception 'Acesso negado';
  end if;

  -- Estoques são mantidos em memória para que o cálculo possa rodar em
  -- transações somente leitura, sem perder a prevenção de dupla contagem.
  for ins in
    select i.id, i.estoque_atual, i.unidade
    from public.producao_insumos i
    where i.ativo and i.controla_estoque
  loop
    chave := 'insumo:' || ins.id::text;
    estoques := jsonb_set(
      estoques,
      array[chave],
      jsonb_build_object(
        'quantidade', coalesce(ins.estoque_atual, 0),
        'unidade', ins.unidade
      ),
      true
    );
  end loop;

  for componente in
    select e.ficha_id, e.quantidade_disponivel, e.unidade
    from public.producao_estoque_preparos e
  loop
    chave := 'preparo:' || componente.ficha_id::text;
    estoques := jsonb_set(
      estoques,
      array[chave],
      jsonb_build_object(
        'quantidade', coalesce(componente.quantidade_disponivel, 0),
        'unidade', componente.unidade
      ),
      true
    );
  end loop;

  for plano in
    select
      p.id,
      p.data_producao,
      p.produto_id,
      p.quantidade,
      pr.ficha_tecnica_id,
      f.rendimento_padrao
    from public.producao_planejamento p
    join public.producao_produtos pr on pr.id = p.produto_id
    left join public.producao_fichas_tecnicas f
      on f.id = pr.ficha_tecnica_id and f.ativo
    where p.status in ('planejado', 'em_producao')
    order by p.data_producao, p.created_at, p.id
  loop
    if plano.ficha_tecnica_id is not null then
      fila := fila || jsonb_build_array(
        jsonb_build_object(
          'data', plano.data_producao::text,
          'ficha_id', plano.ficha_tecnica_id::text,
          'receitas', plano.quantidade / nullif(plano.rendimento_padrao, 0),
          'caminho', jsonb_build_array(plano.ficha_tecnica_id::text)
        )
      );

      while jsonb_array_length(fila) > 0 loop
        fila_item := fila -> 0;
        fila := fila - 0;
        data_atual := (fila_item ->> 'data')::date;
        ficha_atual := (fila_item ->> 'ficha_id')::uuid;
        receitas_atual := (fila_item ->> 'receitas')::numeric;
        caminho := fila_item -> 'caminho';

        for item in
          select fi.*
          from public.producao_ficha_itens fi
          where fi.ficha_id = ficha_atual
          order by fi.created_at, fi.id
        loop
          necessario := receitas_atual * item.quantidade;

          if item.componente_ficha_id is not null then
            if caminho ? item.componente_ficha_id::text then
              raise exception 'Ciclo detectado na ficha técnica';
            end if;

            select f.id, f.rendimento_padrao, f.unidade_rendimento
            into componente
            from public.producao_fichas_tecnicas f
            where f.id = item.componente_ficha_id and f.ativo;

            if componente.id is null then
              raise exception 'Componente inativo ou inexistente';
            end if;

            necessario_base := private.converter_unidade_producao(
              necessario,
              item.unidade,
              componente.unidade_rendimento
            );

            chave := 'preparo:' || componente.id::text;
            disponivel := coalesce(
              (estoques #>> array[chave, 'quantidade'])::numeric,
              0
            );
            utilizado := least(disponivel, necessario_base);
            estoques := jsonb_set(
              estoques,
              array[chave],
              jsonb_build_object(
                'quantidade', disponivel - utilizado,
                'unidade', componente.unidade_rendimento
              ),
              true
            );
            falta := necessario_base - utilizado;

            if falta > 0.000001 then
              fila := fila || jsonb_build_array(
                jsonb_build_object(
                  'data', data_atual::text,
                  'ficha_id', componente.id::text,
                  'receitas', falta / nullif(componente.rendimento_padrao, 0),
                  'caminho', caminho || jsonb_build_array(componente.id::text)
                )
              );
            end if;
          else
            select i.*
            into ins
            from public.producao_insumos i
            where i.id = item.insumo_id and i.ativo;

            if ins.id is not null and ins.controla_estoque then
              necessario_base := private.converter_unidade_producao(
                necessario,
                item.unidade,
                ins.unidade
              );

              chave := 'insumo:' || ins.id::text;
              disponivel := coalesce(
                (estoques #>> array[chave, 'quantidade'])::numeric,
                0
              );
              utilizado := least(disponivel, necessario_base);
              estoques := jsonb_set(
                estoques,
                array[chave],
                jsonb_build_object(
                  'quantidade', disponivel - utilizado,
                  'unidade', ins.unidade
                ),
                true
              );
              falta := necessario_base - utilizado;

              resultado_chave := data_atual::text || '|' || ins.id::text;
              necessario_acumulado := coalesce(
                (resultados #>> array[resultado_chave, 'quantidade_necessaria'])::numeric,
                0
              );
              comprar_acumulado := coalesce(
                (resultados #>> array[resultado_chave, 'quantidade_a_comprar'])::numeric,
                0
              );
              resultados := jsonb_set(
                resultados,
                array[resultado_chave],
                jsonb_build_object(
                  'data', data_atual::text,
                  'insumo_id', ins.id::text,
                  'quantidade_necessaria', necessario_acumulado + necessario_base,
                  'quantidade_a_comprar', comprar_acumulado + greatest(falta, 0)
                ),
                true
              );
            end if;
          end if;
        end loop;
      end loop;
    else
      for item in
        select
          r.insumo_id,
          r.quantidade_por_unidade,
          i.unidade,
          i.estoque_atual,
          i.controla_estoque
        from public.producao_receitas r
        join public.producao_insumos i
          on i.id = r.insumo_id and i.ativo
        where r.produto_id = plano.produto_id
      loop
        if item.controla_estoque then
          necessario_base := plano.quantidade * item.quantidade_por_unidade;
          chave := 'insumo:' || item.insumo_id::text;
          disponivel := coalesce(
            (estoques #>> array[chave, 'quantidade'])::numeric,
            0
          );
          utilizado := least(disponivel, necessario_base);
          estoques := jsonb_set(
            estoques,
            array[chave],
            jsonb_build_object(
              'quantidade', disponivel - utilizado,
              'unidade', item.unidade
            ),
            true
          );
          falta := necessario_base - utilizado;

          resultado_chave := plano.data_producao::text || '|' || item.insumo_id::text;
          necessario_acumulado := coalesce(
            (resultados #>> array[resultado_chave, 'quantidade_necessaria'])::numeric,
            0
          );
          comprar_acumulado := coalesce(
            (resultados #>> array[resultado_chave, 'quantidade_a_comprar'])::numeric,
            0
          );
          resultados := jsonb_set(
            resultados,
            array[resultado_chave],
            jsonb_build_object(
              'data', plano.data_producao::text,
              'insumo_id', item.insumo_id::text,
              'quantidade_necessaria', necessario_acumulado + necessario_base,
              'quantidade_a_comprar', comprar_acumulado + greatest(falta, 0)
            ),
            true
          );
        end if;
      end loop;
    end if;
  end loop;

  return query
  select
    (resultado.value ->> 'data')::date,
    i.id,
    i.nome,
    i.unidade,
    ((resultado.value ->> 'quantidade_necessaria')::numeric)::numeric(14,3),
    i.estoque_atual::numeric(14,3),
    ((resultado.value ->> 'quantidade_a_comprar')::numeric)::numeric(14,3)
  from jsonb_each(resultados) resultado
  join public.producao_insumos i
    on i.id = (resultado.value ->> 'insumo_id')::uuid
  order by (resultado.value ->> 'data')::date, i.nome;
end;
$function$;

notify pgrst, 'reload schema';
