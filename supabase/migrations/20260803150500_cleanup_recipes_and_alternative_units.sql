-- Limpeza dos registros de teste e suporte a unidade alternativa de compra/contagem.

-- 1. Remove o planejamento e o produto de teste "Farinha de Trigo".
do $$
declare
  v_produto_id uuid;
begin
  select id into v_produto_id
  from public.producao_produtos
  where lower(nome) = lower('Farinha de Trigo')
  order by created_at
  limit 1;

  if v_produto_id is not null then
    delete from public.producao_planejamento
    where produto_id = v_produto_id
      and not exists (
        select 1 from public.producao_lotes l
        where l.planejamento_id = public.producao_planejamento.id
      )
      and not exists (
        select 1 from public.producao_consumos c
        where c.planejamento_id = public.producao_planejamento.id
      );

    if not exists (select 1 from public.producao_planejamento where produto_id = v_produto_id)
       and not exists (select 1 from public.producao_lotes where produto_id = v_produto_id)
       and not exists (select 1 from public.producao_movimentacoes_salgadinhos where produto_id = v_produto_id) then
      delete from public.producao_produtos where id = v_produto_id;
    end if;
  end if;
end;
$$;

-- 2. Remove apenas as fichas finais vazias e seus produtos, preservando massas e recheios.
do $$
declare
  v_ficha record;
begin
  for v_ficha in
    select f.id as ficha_id, p.id as produto_id
    from public.producao_fichas_tecnicas f
    join public.producao_produtos p on p.ficha_tecnica_id = f.id
    where f.categoria = 'salgado'
      and f.nome in ('Churros', 'Kibe', 'Rolinho de pizza', 'Rolinho de calabresa')
      and not exists (select 1 from public.producao_ficha_itens fi where fi.ficha_id = f.id)
      and not exists (select 1 from public.producao_planejamento pl where pl.produto_id = p.id)
      and not exists (select 1 from public.producao_lotes l where l.produto_id = p.id)
      and not exists (select 1 from public.producao_movimentacoes_salgadinhos m where m.produto_id = p.id)
  loop
    delete from public.producao_produtos where id = v_ficha.produto_id;
    delete from public.producao_fichas_tecnicas where id = v_ficha.ficha_id;
  end loop;
end;
$$;

-- 3. A Coxinha usa três preparos: massa, recheio e bechamel.
insert into public.producao_ficha_itens (
  ficha_id,
  componente_ficha_id,
  quantidade,
  unidade
)
select
  coxinha.id,
  bechamel.id,
  bechamel.rendimento_padrao,
  bechamel.unidade_rendimento
from public.producao_fichas_tecnicas coxinha
join public.producao_fichas_tecnicas bechamel
  on bechamel.nome = 'Bechamel da Coxinha'
 and bechamel.categoria = 'recheio'
 and bechamel.ativo
where coxinha.nome = 'Coxinha'
  and coxinha.categoria = 'salgado'
  and coxinha.ativo
  and not exists (
    select 1
    from public.producao_ficha_itens fi
    where fi.ficha_id = coxinha.id
      and fi.componente_ficha_id = bechamel.id
  );

update public.producao_fichas_tecnicas
set revisao_pendente = true,
    rendimento_confirmado = false,
    observacoes = concat_ws(
      E'\n',
      nullif(observacoes, ''),
      'Composição: massa, recheio de frango e 1 receita completa de Bechamel da Coxinha. Validar o rendimento real do conjunto.'
    ),
    updated_at = now()
where nome = 'Coxinha'
  and categoria = 'salgado'
  and ativo;

-- 4. Unidade base e unidade alternativa de compra/contagem.
alter table public.producao_insumos
  add column if not exists unidade_alternativa text,
  add column if not exists fator_unidade_alternativa numeric(14,4);

alter table public.producao_insumos
  drop constraint if exists producao_insumos_unidade_alternativa_check;

alter table public.producao_insumos
  add constraint producao_insumos_unidade_alternativa_check
  check (
    (unidade_alternativa is null and fator_unidade_alternativa is null)
    or (
      nullif(btrim(unidade_alternativa), '') is not null
      and fator_unidade_alternativa > 0
      and unidade_alternativa <> unidade
    )
  );

-- Queijo e presunto passam a ser controlados em kg, aceitando peça como alternativa.
update public.producao_insumos
set nome = 'Queijo',
    unidade = 'kg',
    unidade_alternativa = 'peça',
    fator_unidade_alternativa = 4.0000,
    updated_at = now()
where nome = 'Queijo - peça inteira';

update public.producao_insumos
set nome = 'Presunto',
    unidade = 'kg',
    unidade_alternativa = 'peça',
    fator_unidade_alternativa = 3.5000,
    updated_at = now()
where nome = 'Presunto - peça inteira';

-- As fichas que antes pediam 1 peça passam a registrar o peso médio em kg.
update public.producao_ficha_itens fi
set quantidade = fi.quantidade * i.fator_unidade_alternativa,
    unidade = i.unidade
from public.producao_insumos i
where fi.insumo_id = i.id
  and i.nome in ('Queijo', 'Presunto')
  and fi.unidade = 'un'
  and i.fator_unidade_alternativa is not null;

-- Conversão segura para o saldo contado em kg ou na unidade alternativa.
create or replace function public.ajustar_estoque_insumo_convertido(
  insumo_id_param uuid,
  novo_saldo_param numeric,
  unidade_informada_param text,
  motivo_param text,
  observacoes_param text default null
)
returns numeric
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  v_insumo record;
  v_saldo_base numeric(14,3);
begin
  if (select auth.uid()) is null
    or not private.usuario_pode_acessar('producao_estoque') then
    raise exception 'Acesso negado';
  end if;

  if novo_saldo_param is null or novo_saldo_param < 0 then
    raise exception 'Saldo contado inválido';
  end if;

  select id, unidade, unidade_alternativa, fator_unidade_alternativa
  into v_insumo
  from public.producao_insumos
  where id = insumo_id_param and ativo;

  if not found then
    raise exception 'Insumo não encontrado ou inativo';
  end if;

  if unidade_informada_param = v_insumo.unidade then
    v_saldo_base := novo_saldo_param;
  elsif unidade_informada_param = v_insumo.unidade_alternativa
    and v_insumo.fator_unidade_alternativa is not null then
    v_saldo_base := novo_saldo_param * v_insumo.fator_unidade_alternativa;
  else
    raise exception 'Unidade inválida para este insumo';
  end if;

  return public.ajustar_estoque_insumo(
    insumo_id_param,
    v_saldo_base,
    motivo_param,
    concat_ws(
      E'\n',
      nullif(btrim(observacoes_param), ''),
      case
        when unidade_informada_param <> v_insumo.unidade
          then novo_saldo_param || ' ' || unidade_informada_param || ' = ' || v_saldo_base || ' ' || v_insumo.unidade
        else null
      end
    )
  );
end;
$$;

revoke all on function public.ajustar_estoque_insumo_convertido(uuid,numeric,text,text,text) from public;
grant execute on function public.ajustar_estoque_insumo_convertido(uuid,numeric,text,text,text) to authenticated;

notify pgrst, 'reload schema';
