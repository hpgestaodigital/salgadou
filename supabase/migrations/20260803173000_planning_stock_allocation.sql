-- Calcula necessidades em ordem cronológica, consumindo cada saldo disponível apenas uma vez.
drop view if exists public.producao_necessidades;

create or replace function public.calcular_necessidades_producao()
returns table(
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
set search_path=pg_catalog,public,private,pg_temp
as $$
declare
  plano record;
  fila record;
  item record;
  componente record;
  ins record;
  necessario numeric(18,6);
  necessario_base numeric(18,6);
  disponivel numeric(18,6);
  utilizado numeric(18,6);
  falta numeric(18,6);
begin
  if auth.uid() is null or not (
    private.usuario_pode_acessar('producao_planejamento') or
    private.usuario_pode_acessar('producao_compras') or
    private.usuario_pode_acessar('producao_estoque')
  ) then raise exception 'Acesso negado'; end if;

  create temporary table if not exists calc_estoques(
    tipo text not null,
    referencia_id uuid not null,
    quantidade numeric(18,6) not null,
    unidade text not null,
    primary key(tipo,referencia_id)
  ) on commit drop;
  create temporary table if not exists calc_fila(
    qid bigserial primary key,
    data date not null,
    ficha_id uuid not null,
    receitas numeric(18,8) not null,
    caminho uuid[] not null
  ) on commit drop;
  create temporary table if not exists calc_resultado(
    data date not null,
    insumo_id uuid not null,
    quantidade_necessaria numeric(18,6) not null,
    quantidade_a_comprar numeric(18,6) not null
  ) on commit drop;

  truncate calc_estoques,calc_fila,calc_resultado restart identity;

  insert into calc_estoques(tipo,referencia_id,quantidade,unidade)
  select 'insumo',i.id,i.estoque_atual,i.unidade
  from public.producao_insumos i where i.ativo and i.controla_estoque;

  insert into calc_estoques(tipo,referencia_id,quantidade,unidade)
  select 'preparo',e.ficha_id,e.quantidade_disponivel,e.unidade
  from public.producao_estoque_preparos e;

  for plano in
    select p.id,p.data_producao,p.produto_id,p.quantidade,pr.ficha_tecnica_id,f.rendimento_padrao
    from public.producao_planejamento p
    join public.producao_produtos pr on pr.id=p.produto_id
    left join public.producao_fichas_tecnicas f on f.id=pr.ficha_tecnica_id and f.ativo
    where p.status in ('planejado','em_producao')
    order by p.data_producao,p.created_at,p.id
  loop
    if plano.ficha_tecnica_id is not null then
      insert into calc_fila(data,ficha_id,receitas,caminho)
      values(plano.data_producao,plano.ficha_tecnica_id,plano.quantidade/nullif(plano.rendimento_padrao,0),array[plano.ficha_tecnica_id]::uuid[]);

      while exists(select 1 from calc_fila) loop
        select * into fila from calc_fila order by qid limit 1;
        delete from calc_fila where qid=fila.qid;

        for item in select * from public.producao_ficha_itens where ficha_id=fila.ficha_id order by created_at,id loop
          necessario:=fila.receitas*item.quantidade;
          if item.componente_ficha_id is not null then
            if item.componente_ficha_id=any(fila.caminho) then raise exception 'Ciclo detectado na ficha técnica'; end if;
            select id,rendimento_padrao,unidade_rendimento into componente
            from public.producao_fichas_tecnicas where id=item.componente_ficha_id and ativo;
            if componente.id is null then raise exception 'Componente inativo ou inexistente'; end if;
            necessario_base:=private.converter_unidade_producao(necessario,item.unidade,componente.unidade_rendimento);
            select quantidade into disponivel from calc_estoques where tipo='preparo' and referencia_id=componente.id for update;
            disponivel:=coalesce(disponivel,0);
            utilizado:=least(disponivel,necessario_base);
            update calc_estoques set quantidade=quantidade-utilizado where tipo='preparo' and referencia_id=componente.id;
            falta:=necessario_base-utilizado;
            if falta>0.000001 then
              insert into calc_fila(data,ficha_id,receitas,caminho)
              values(fila.data,componente.id,falta/nullif(componente.rendimento_padrao,0),fila.caminho||componente.id);
            end if;
          else
            select * into ins from public.producao_insumos where id=item.insumo_id and ativo;
            if ins.id is not null and ins.controla_estoque then
              necessario_base:=private.converter_unidade_producao(necessario,item.unidade,ins.unidade);
              select quantidade into disponivel from calc_estoques where tipo='insumo' and referencia_id=ins.id for update;
              disponivel:=coalesce(disponivel,0);
              utilizado:=least(disponivel,necessario_base);
              update calc_estoques set quantidade=quantidade-utilizado where tipo='insumo' and referencia_id=ins.id;
              falta:=necessario_base-utilizado;
              insert into calc_resultado(data,insumo_id,quantidade_necessaria,quantidade_a_comprar)
              values(fila.data,ins.id,necessario_base,greatest(falta,0));
            end if;
          end if;
        end loop;
      end loop;
    else
      for item in
        select r.insumo_id,r.quantidade_por_unidade,i.unidade,i.estoque_atual,i.controla_estoque
        from public.producao_receitas r join public.producao_insumos i on i.id=r.insumo_id and i.ativo
        where r.produto_id=plano.produto_id
      loop
        if item.controla_estoque then
          necessario_base:=plano.quantidade*item.quantidade_por_unidade;
          select quantidade into disponivel from calc_estoques where tipo='insumo' and referencia_id=item.insumo_id for update;
          disponivel:=coalesce(disponivel,0);
          utilizado:=least(disponivel,necessario_base);
          update calc_estoques set quantidade=quantidade-utilizado where tipo='insumo' and referencia_id=item.insumo_id;
          falta:=necessario_base-utilizado;
          insert into calc_resultado(data,insumo_id,quantidade_necessaria,quantidade_a_comprar)
          values(plano.data_producao,item.insumo_id,necessario_base,greatest(falta,0));
        end if;
      end loop;
    end if;
  end loop;

  return query
  select r.data,i.id,i.nome,i.unidade,
    sum(r.quantidade_necessaria)::numeric(14,3),
    i.estoque_atual::numeric(14,3),
    sum(r.quantidade_a_comprar)::numeric(14,3)
  from calc_resultado r
  join public.producao_insumos i on i.id=r.insumo_id
  group by r.data,i.id,i.nome,i.unidade,i.estoque_atual
  order by r.data,i.nome;
end;
$$;

revoke all on function public.calcular_necessidades_producao() from public;
grant execute on function public.calcular_necessidades_producao() to authenticated;

create view public.producao_necessidades as
select * from public.calcular_necessidades_producao();
grant select on public.producao_necessidades to authenticated;