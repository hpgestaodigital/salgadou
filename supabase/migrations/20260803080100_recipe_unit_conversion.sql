-- Substitui a RPC para converter g/kg e ml/l antes de baixar o estoque.
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
  quantidade_ficha numeric(14,4);
  necessario numeric(14,4);
  saldo numeric(14,4);
  lote_id uuid;
  lote_codigo text;
begin
  if (select auth.uid()) is null or not (
    private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')
  ) then raise exception 'Acesso negado'; end if;

  if receitas_param is null or receitas_param <= 0 then raise exception 'Informe quantas receitas foram produzidas'; end if;
  if coalesce(grandes_param,0) < 0 or coalesce(pequenas_param,0) < 0 then raise exception 'Rendimento inválido'; end if;
  if coalesce(grandes_param,0) + coalesce(pequenas_param,0) <= 0 then raise exception 'Informe ao menos uma bisnaga produzida'; end if;

  select * into ficha from public.producao_fichas_tecnicas
  where id = ficha_id_param and categoria = 'molho' and ativo;
  if not found then raise exception 'Ficha técnica de molho não encontrada'; end if;

  if exists (select 1 from public.producao_ficha_itens where ficha_id=ficha_id_param and componente_ficha_id is not null) then
    raise exception 'A produção direta de molho aceita apenas insumos na ficha técnica';
  end if;
  if not exists (select 1 from public.producao_ficha_itens where ficha_id=ficha_id_param) then
    raise exception 'Cadastre os insumos da ficha técnica antes de produzir';
  end if;

  for item in
    select fi.*, i.nome, i.unidade as unidade_estoque, i.estoque_atual
    from public.producao_ficha_itens fi
    join public.producao_insumos i on i.id=fi.insumo_id
    where fi.ficha_id=ficha_id_param
    for update of i
  loop
    quantidade_ficha := item.quantidade * receitas_param;
    necessario := case
      when item.unidade = item.unidade_estoque then quantidade_ficha
      when item.unidade = 'g' and item.unidade_estoque = 'kg' then quantidade_ficha / 1000
      when item.unidade = 'kg' and item.unidade_estoque = 'g' then quantidade_ficha * 1000
      when item.unidade = 'ml' and item.unidade_estoque = 'l' then quantidade_ficha / 1000
      when item.unidade = 'l' and item.unidade_estoque = 'ml' then quantidade_ficha * 1000
      else null
    end;

    if necessario is null then
      raise exception 'Unidade incompatível em %. Ficha: %, estoque: %', item.nome, item.unidade, item.unidade_estoque;
    end if;

    saldo := item.estoque_atual;
    if saldo < necessario then
      raise exception 'Saldo insuficiente de %. Necessário: % %, disponível: % %', item.nome, necessario, item.unidade_estoque, saldo, item.unidade_estoque;
    end if;

    update public.producao_insumos
      set estoque_atual = saldo - necessario, updated_at = now()
      where id=item.insumo_id;

    insert into public.producao_estoque_movimentacoes(
      insumo_id,tipo,quantidade,saldo_anterior,saldo_posterior,
      origem_tipo,motivo,observacoes,criado_por
    ) values (
      item.insumo_id,'saida',necessario,saldo,saldo-necessario,
      'producao_molho','Produção de ' || ficha.nome,
      nullif(btrim(observacoes_param),''),(select auth.uid())
    );
  end loop;

  lote_codigo := 'MOL-' || to_char(coalesce(data_param,current_date),'YYYYMMDD') || '-' || upper(substr(replace(ficha.nome,' ',''),1,4)) || '-' || substr(gen_random_uuid()::text,1,4);

  insert into public.producao_molho_lotes(
    ficha_id,codigo,data_producao,receitas_produzidas,rendimento_esperado,
    bisnagas_grandes,bisnagas_pequenas,bisnagas_grandes_disponiveis,
    bisnagas_pequenas_disponiveis,observacoes,criado_por
  ) values (
    ficha_id_param,lote_codigo,coalesce(data_param,current_date),receitas_param,
    ficha.rendimento_padrao * receitas_param,coalesce(grandes_param,0),coalesce(pequenas_param,0),
    coalesce(grandes_param,0),coalesce(pequenas_param,0),nullif(btrim(observacoes_param),''),(select auth.uid())
  ) returning id into lote_id;

  return lote_id;
end;
$$;
