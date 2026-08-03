-- Saídas de molhos, contagem física, rastreabilidade e sincronização de compras.

create table if not exists public.producao_molho_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.producao_fichas_tecnicas(id),
  lote_id uuid references public.producao_molho_lotes(id),
  tamanho text not null check (tamanho in ('grande','pequena')),
  tipo text not null check (tipo in ('entrada','saida','ajuste')),
  quantidade integer not null check (quantidade > 0),
  saldo_anterior integer not null check (saldo_anterior >= 0),
  saldo_posterior integer not null check (saldo_posterior >= 0),
  motivo text not null,
  data_movimentacao date not null default current_date,
  observacoes text,
  criado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists producao_molho_mov_fifo_idx on public.producao_molho_movimentacoes(ficha_id,tamanho,data_movimentacao,created_at);
alter table public.producao_molho_movimentacoes enable row level security;
create policy "Ler movimentacoes de molho" on public.producao_molho_movimentacoes for select to authenticated
using (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'));
revoke insert,update,delete on public.producao_molho_movimentacoes from authenticated;

insert into public.producao_molho_movimentacoes(ficha_id,lote_id,tamanho,tipo,quantidade,saldo_anterior,saldo_posterior,motivo,data_movimentacao,observacoes,criado_por,created_at)
select l.ficha_id,l.id,'grande','entrada',l.bisnagas_grandes,0,l.bisnagas_grandes,'Saldo inicial do lote',l.data_producao,l.observacoes,l.criado_por,l.created_at
from public.producao_molho_lotes l where l.bisnagas_grandes>0
and not exists(select 1 from public.producao_molho_movimentacoes m where m.lote_id=l.id and m.tamanho='grande' and m.tipo='entrada');
insert into public.producao_molho_movimentacoes(ficha_id,lote_id,tamanho,tipo,quantidade,saldo_anterior,saldo_posterior,motivo,data_movimentacao,observacoes,criado_por,created_at)
select l.ficha_id,l.id,'pequena','entrada',l.bisnagas_pequenas,0,l.bisnagas_pequenas,'Saldo inicial do lote',l.data_producao,l.observacoes,l.criado_por,l.created_at
from public.producao_molho_lotes l where l.bisnagas_pequenas>0
and not exists(select 1 from public.producao_molho_movimentacoes m where m.lote_id=l.id and m.tamanho='pequena' and m.tipo='entrada');

create or replace view public.producao_estoque_molhos as
select f.id as ficha_id,f.nome,
  coalesce(sum(l.bisnagas_grandes_disponiveis),0)::integer as grandes_disponiveis,
  coalesce(sum(l.bisnagas_pequenas_disponiveis),0)::integer as pequenas_disponiveis,
  max(l.data_producao) as ultima_producao
from public.producao_fichas_tecnicas f
left join public.producao_molho_lotes l on l.ficha_id=f.id
where f.categoria='molho' and f.ativo
group by f.id,f.nome;
grant select on public.producao_estoque_molhos to authenticated;

create or replace function public.registrar_producao_molho(
  ficha_id_param uuid, receitas_param numeric, data_param date, grandes_param integer, pequenas_param integer, observacoes_param text default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare ficha record; item record; necessario numeric(14,4); necessario_insumo numeric(14,4); saldo numeric(14,4); lote_id uuid; lote_codigo text;
begin
  if auth.uid() is null or not (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')) then raise exception 'Acesso negado'; end if;
  if receitas_param is null or receitas_param<=0 then raise exception 'Informe quantas receitas foram produzidas'; end if;
  if coalesce(grandes_param,0)<0 or coalesce(pequenas_param,0)<0 or coalesce(grandes_param,0)+coalesce(pequenas_param,0)<=0 then raise exception 'Informe as bisnagas produzidas'; end if;
  select * into ficha from public.producao_fichas_tecnicas where id=ficha_id_param and categoria='molho' and ativo;
  if not found then raise exception 'Ficha técnica de molho não encontrada'; end if;
  if exists(select 1 from public.producao_ficha_itens where ficha_id=ficha_id_param and componente_ficha_id is not null) then raise exception 'A produção de molho aceita apenas insumos'; end if;
  if not exists(select 1 from public.producao_ficha_itens where ficha_id=ficha_id_param) then raise exception 'Cadastre os ingredientes antes de produzir'; end if;
  for item in select fi.*,i.nome,i.unidade as unidade_insumo,i.estoque_atual,i.controla_estoque from public.producao_ficha_itens fi join public.producao_insumos i on i.id=fi.insumo_id where fi.ficha_id=ficha_id_param order by fi.created_at loop
    if item.controla_estoque then
      select estoque_atual into saldo from public.producao_insumos where id=item.insumo_id for update;
      necessario:=item.quantidade*receitas_param;
      necessario_insumo:=private.converter_unidade_producao(necessario,item.unidade,item.unidade_insumo);
      if saldo<necessario_insumo then raise exception 'Saldo insuficiente de %. Necessário: % %, disponível: % %',item.nome,necessario_insumo,item.unidade_insumo,saldo,item.unidade_insumo; end if;
      update public.producao_insumos set estoque_atual=saldo-necessario_insumo,updated_at=now() where id=item.insumo_id;
      insert into public.producao_estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_posterior,origem_tipo,origem_id,motivo,observacoes,criado_por)
      values(item.insumo_id,'saida',necessario_insumo,saldo,saldo-necessario_insumo,'producao_molho',ficha_id_param,'Produção de '||ficha.nome,nullif(btrim(observacoes_param),''),auth.uid());
    end if;
  end loop;
  lote_codigo:='MOL-'||to_char(coalesce(data_param,current_date),'YYYYMMDD')||'-'||upper(substr(replace(ficha.nome,' ',''),1,4))||'-'||substr(gen_random_uuid()::text,1,4);
  insert into public.producao_molho_lotes(ficha_id,codigo,data_producao,receitas_produzidas,rendimento_esperado,bisnagas_grandes,bisnagas_pequenas,bisnagas_grandes_disponiveis,bisnagas_pequenas_disponiveis,observacoes,criado_por)
  values(ficha_id_param,lote_codigo,coalesce(data_param,current_date),receitas_param,ficha.rendimento_padrao*receitas_param,coalesce(grandes_param,0),coalesce(pequenas_param,0),coalesce(grandes_param,0),coalesce(pequenas_param,0),nullif(btrim(observacoes_param),''),auth.uid()) returning id into lote_id;
  if coalesce(grandes_param,0)>0 then insert into public.producao_molho_movimentacoes(ficha_id,lote_id,tamanho,tipo,quantidade,saldo_anterior,saldo_posterior,motivo,data_movimentacao,observacoes,criado_por) values(ficha_id_param,lote_id,'grande','entrada',grandes_param,0,grandes_param,'Produção de '||ficha.nome,coalesce(data_param,current_date),nullif(btrim(observacoes_param),''),auth.uid()); end if;
  if coalesce(pequenas_param,0)>0 then insert into public.producao_molho_movimentacoes(ficha_id,lote_id,tamanho,tipo,quantidade,saldo_anterior,saldo_posterior,motivo,data_movimentacao,observacoes,criado_por) values(ficha_id_param,lote_id,'pequena','entrada',pequenas_param,0,pequenas_param,'Produção de '||ficha.nome,coalesce(data_param,current_date),nullif(btrim(observacoes_param),''),auth.uid()); end if;
  return lote_id;
end;$$;

create or replace function public.registrar_saida_molho(ficha_id_param uuid,tamanho_param text,quantidade_param integer,motivo_param text,data_param date default current_date,observacoes_param text default null)
returns void language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare lote record; restante integer:=quantidade_param; disponivel integer; retirar integer;
begin
  if auth.uid() is null or not (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')) then raise exception 'Acesso negado'; end if;
  if tamanho_param not in ('grande','pequena') then raise exception 'Tamanho inválido'; end if;
  if quantidade_param is null or quantidade_param<=0 then raise exception 'Quantidade inválida'; end if;
  for lote in select * from public.producao_molho_lotes where ficha_id=ficha_id_param and case when tamanho_param='grande' then bisnagas_grandes_disponiveis else bisnagas_pequenas_disponiveis end>0 order by data_producao,created_at for update loop
    exit when restante<=0;
    disponivel:=case when tamanho_param='grande' then lote.bisnagas_grandes_disponiveis else lote.bisnagas_pequenas_disponiveis end;
    retirar:=least(restante,disponivel);
    if tamanho_param='grande' then update public.producao_molho_lotes set bisnagas_grandes_disponiveis=bisnagas_grandes_disponiveis-retirar where id=lote.id;
    else update public.producao_molho_lotes set bisnagas_pequenas_disponiveis=bisnagas_pequenas_disponiveis-retirar where id=lote.id; end if;
    insert into public.producao_molho_movimentacoes(ficha_id,lote_id,tamanho,tipo,quantidade,saldo_anterior,saldo_posterior,motivo,data_movimentacao,observacoes,criado_por)
    values(ficha_id_param,lote.id,tamanho_param,'saida',retirar,disponivel,disponivel-retirar,coalesce(nullif(btrim(motivo_param),''),'Saída manual'),coalesce(data_param,current_date),nullif(btrim(observacoes_param),''),auth.uid());
    restante:=restante-retirar;
  end loop;
  if restante>0 then raise exception 'Estoque insuficiente de bisnagas %. Faltam %',tamanho_param,restante; end if;
end;$$;

revoke all on function public.registrar_saida_molho(uuid,text,integer,text,date,text) from public;
grant execute on function public.registrar_saida_molho(uuid,text,integer,text,date,text) to authenticated;

-- Produção intermediária passa a ignorar apenas a baixa de insumos marcados como não controlados.
create or replace function public.registrar_producao_preparo(
  ficha_id_param uuid,receitas_param numeric,quantidade_real_param numeric,unidade_param text,data_param date default current_date,observacoes_param text default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare ficha record; item record; insumo record; necessario numeric(14,4); necessario_insumo numeric(14,4); saldo numeric(14,4); lote_id uuid; lote_codigo text;
begin
  if auth.uid() is null or not (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')) then raise exception 'Acesso negado'; end if;
  if receitas_param is null or receitas_param<=0 or quantidade_real_param is null or quantidade_real_param<=0 then raise exception 'Informe receitas e rendimento real'; end if;
  select * into ficha from public.producao_fichas_tecnicas where id=ficha_id_param and categoria in ('massa','recheio') and ativo;
  if not found then raise exception 'Ficha de massa ou recheio não encontrada'; end if;
  perform private.converter_unidade_producao(quantidade_real_param,unidade_param,ficha.unidade_rendimento);
  if not exists(select 1 from public.producao_ficha_itens where ficha_id=ficha_id_param) then raise exception 'Cadastre os ingredientes ou componentes antes de produzir'; end if;
  for item in select * from public.producao_ficha_itens where ficha_id=ficha_id_param order by created_at loop
    necessario:=item.quantidade*receitas_param;
    if item.insumo_id is not null then
      select * into insumo from public.producao_insumos where id=item.insumo_id for update;
      if insumo.controla_estoque then
        necessario_insumo:=private.converter_unidade_producao(necessario,item.unidade,insumo.unidade); saldo:=insumo.estoque_atual;
        if saldo<necessario_insumo then raise exception 'Saldo insuficiente de %. Necessário: % %, disponível: % %',insumo.nome,necessario_insumo,insumo.unidade,saldo,insumo.unidade; end if;
        update public.producao_insumos set estoque_atual=saldo-necessario_insumo,updated_at=now() where id=insumo.id;
        insert into public.producao_estoque_movimentacoes(insumo_id,tipo,quantidade,saldo_anterior,saldo_posterior,origem_tipo,origem_id,motivo,observacoes,criado_por)
        values(insumo.id,'saida',necessario_insumo,saldo,saldo-necessario_insumo,'producao_preparo',ficha_id_param,'Produção de '||ficha.nome,nullif(btrim(observacoes_param),''),auth.uid());
      end if;
    else
      perform private.consumir_preparo_fifo(item.componente_ficha_id,necessario,item.unidade,'producao_preparo',ficha_id_param,'Componente utilizado na produção de '||ficha.nome,observacoes_param);
    end if;
  end loop;
  lote_codigo:='PRE-'||to_char(coalesce(data_param,current_date),'YYYYMMDD')||'-'||upper(substr(replace(ficha.nome,' ',''),1,4))||'-'||substr(gen_random_uuid()::text,1,4);
  insert into public.producao_preparos_lotes(ficha_id,codigo,data_producao,receitas_produzidas,quantidade_prevista,quantidade_produzida,quantidade_disponivel,unidade,observacoes,criado_por)
  values(ficha_id_param,lote_codigo,coalesce(data_param,current_date),receitas_param,ficha.rendimento_padrao*receitas_param,quantidade_real_param,quantidade_real_param,unidade_param,nullif(btrim(observacoes_param),''),auth.uid()) returning id into lote_id;
  insert into public.producao_preparos_movimentacoes(ficha_id,lote_id,tipo,quantidade,unidade,saldo_anterior,saldo_posterior,origem_tipo,origem_id,motivo,observacoes,criado_por)
  values(ficha_id_param,lote_id,'entrada',quantidade_real_param,unidade_param,0,quantidade_real_param,'producao_preparo',lote_id,'Produção de '||ficha.nome,nullif(btrim(observacoes_param),''),auth.uid());
  return lote_id;
end;$$;

create table if not exists public.producao_contagens_fisicas (
  id uuid primary key default gen_random_uuid(),tipo_estoque text not null check(tipo_estoque in ('insumo','preparo','molho_grande','molho_pequena','salgadinho')),
  referencia_id uuid not null,saldo_sistema numeric(14,4) not null,saldo_contado numeric(14,4) not null,unidade text not null,
  motivo text not null,observacoes text,criado_por uuid default auth.uid() references auth.users(id),created_at timestamptz not null default now()
);
alter table public.producao_contagens_fisicas enable row level security;
create policy "Acessar contagens fisicas" on public.producao_contagens_fisicas for select to authenticated
using (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'));
revoke insert,update,delete on public.producao_contagens_fisicas from authenticated;

create or replace function public.registrar_contagem_fisica(tipo_param text,referencia_id_param uuid,saldo_contado_param numeric,motivo_param text,observacoes_param text default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare atual numeric(14,4); unidade_atual text; diferenca numeric(14,4); registro_id uuid; ficha record; lote record; restante numeric(14,4); retirar numeric(14,4);
begin
  if auth.uid() is null or not (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')) then raise exception 'Acesso negado'; end if;
  if saldo_contado_param is null or saldo_contado_param<0 then raise exception 'Saldo contado inválido'; end if;
  if nullif(btrim(motivo_param),'') is null then raise exception 'Informe o motivo da contagem'; end if;
  if tipo_param='insumo' then
    select estoque_atual,unidade into atual,unidade_atual from public.producao_insumos where id=referencia_id_param;
    if atual is null then raise exception 'Insumo não encontrado'; end if;
    perform public.ajustar_estoque_insumo(referencia_id_param,saldo_contado_param,motivo_param,observacoes_param);
  elsif tipo_param='preparo' then
    select ep.quantidade_disponivel,ep.unidade into atual,unidade_atual from public.producao_estoque_preparos ep where ep.ficha_id=referencia_id_param;
    if atual is null then raise exception 'Preparo não encontrado'; end if;
    diferenca:=saldo_contado_param-atual;
    if diferenca<0 then perform private.consumir_preparo_fifo(referencia_id_param,abs(diferenca),unidade_atual,'contagem_fisica',null,'Ajuste por contagem física',observacoes_param);
    elsif diferenca>0 then
      select * into ficha from public.producao_fichas_tecnicas where id=referencia_id_param;
      insert into public.producao_preparos_lotes(ficha_id,codigo,data_producao,receitas_produzidas,quantidade_prevista,quantidade_produzida,quantidade_disponivel,unidade,observacoes,criado_por)
      values(referencia_id_param,'AJU-'||to_char(current_date,'YYYYMMDD')||'-'||substr(gen_random_uuid()::text,1,6),current_date,1,diferenca,diferenca,diferenca,unidade_atual,observacoes_param,auth.uid()) returning * into lote;
      insert into public.producao_preparos_movimentacoes(ficha_id,lote_id,tipo,quantidade,unidade,saldo_anterior,saldo_posterior,origem_tipo,motivo,observacoes,criado_por)
      values(referencia_id_param,lote.id,'ajuste',diferenca,unidade_atual,atual,saldo_contado_param,'contagem_fisica','Ajuste positivo por contagem física',observacoes_param,auth.uid());
    end if;
  elsif tipo_param in ('molho_grande','molho_pequena') then
    select case when tipo_param='molho_grande' then grandes_disponiveis else pequenas_disponiveis end into atual from public.producao_estoque_molhos where ficha_id=referencia_id_param;
    unidade_atual:='un'; diferenca:=saldo_contado_param-coalesce(atual,0);
    if diferenca<0 then perform public.registrar_saida_molho(referencia_id_param,case when tipo_param='molho_grande' then 'grande' else 'pequena' end,abs(diferenca)::integer,'Ajuste por contagem física',current_date,observacoes_param);
    elsif diferenca>0 then
      insert into public.producao_molho_lotes(ficha_id,codigo,data_producao,receitas_produzidas,rendimento_esperado,bisnagas_grandes,bisnagas_pequenas,bisnagas_grandes_disponiveis,bisnagas_pequenas_disponiveis,observacoes,criado_por)
      values(referencia_id_param,'AJM-'||to_char(current_date,'YYYYMMDD')||'-'||substr(gen_random_uuid()::text,1,6),current_date,1,diferenca,case when tipo_param='molho_grande' then diferenca else 0 end,case when tipo_param='molho_pequena' then diferenca else 0 end,case when tipo_param='molho_grande' then diferenca else 0 end,case when tipo_param='molho_pequena' then diferenca else 0 end,observacoes_param,auth.uid()) returning * into lote;
      insert into public.producao_molho_movimentacoes(ficha_id,lote_id,tamanho,tipo,quantidade,saldo_anterior,saldo_posterior,motivo,data_movimentacao,observacoes,criado_por)
      values(referencia_id_param,lote.id,case when tipo_param='molho_grande' then 'grande' else 'pequena' end,'ajuste',diferenca::integer,coalesce(atual,0)::integer,saldo_contado_param::integer,'Ajuste positivo por contagem física',current_date,observacoes_param,auth.uid());
    end if;
  elsif tipo_param='salgadinho' then
    select coalesce(sum(porcoes_disponiveis),0) into atual from public.producao_lotes where produto_id=referencia_id_param;
    unidade_atual:='porcao'; diferenca:=saldo_contado_param-atual;
    if diferenca<0 then perform public.registrar_retirada_salgadinhos(referencia_id_param,null,abs(diferenca),'porcao',null,'ajuste',current_date,observacoes_param);
    elsif diferenca>0 then
      select * into lote from public.producao_lotes where produto_id=referencia_id_param order by data_producao desc,created_at desc limit 1 for update;
      if lote.id is null then raise exception 'Não existe lote do produto para receber ajuste positivo'; end if;
      update public.producao_lotes set porcoes_disponiveis=porcoes_disponiveis+diferenca,porcoes_produzidas=porcoes_produzidas+diferenca,updated_at=now() where id=lote.id;
      insert into public.producao_movimentacoes_salgadinhos(produto_id,lote_id,tipo,motivo,unidade_informada,quantidade_informada,porcoes_baixadas,saldo_anterior,saldo_posterior,data_movimentacao,observacoes,criado_por)
      values(referencia_id_param,lote.id,'ajuste_contagem','ajuste','porcao',diferenca,diferenca,atual,saldo_contado_param,current_date,observacoes_param,auth.uid());
      insert into public.producao_estoque_final(produto_id,caixas_congeladas,porcoes_empacotadas,updated_at) values(referencia_id_param,0,saldo_contado_param,now()) on conflict(produto_id) do update set porcoes_empacotadas=excluded.porcoes_empacotadas,updated_at=now();
    end if;
  else raise exception 'Tipo de estoque inválido'; end if;
  insert into public.producao_contagens_fisicas(tipo_estoque,referencia_id,saldo_sistema,saldo_contado,unidade,motivo,observacoes,criado_por)
  values(tipo_param,referencia_id_param,coalesce(atual,0),saldo_contado_param,unidade_atual,btrim(motivo_param),nullif(btrim(observacoes_param),''),auth.uid()) returning id into registro_id;
  return registro_id;
end;$$;
revoke all on function public.registrar_contagem_fisica(text,uuid,numeric,text,text) from public;
grant execute on function public.registrar_contagem_fisica(text,uuid,numeric,text,text) to authenticated;

-- Compras automáticas consolidadas pela cadeia atual.
delete from public.producao_lista_compras a using public.producao_lista_compras b
where a.origem_automatica and b.origem_automatica and a.id>b.id and a.insumo_id=b.insumo_id and a.data_necessidade is not distinct from b.data_necessidade;
create unique index if not exists producao_compras_auto_uq on public.producao_lista_compras(insumo_id,data_necessidade) where origem_automatica;
create or replace function public.sincronizar_compras_planejamento()
returns integer language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare total integer;
begin
 if auth.uid() is null or not private.usuario_pode_acessar('producao_compras') then raise exception 'Acesso negado'; end if;
 delete from public.producao_lista_compras c where c.origem_automatica and not exists(select 1 from public.producao_necessidades n where n.insumo_id=c.insumo_id and n.data_producao=c.data_necessidade and n.quantidade_a_comprar>0);
 insert into public.producao_lista_compras(insumo_id,data_necessidade,quantidade_necessaria,quantidade_comprada,status,observacoes,criado_por,origem_automatica)
 select n.insumo_id,n.data_producao,n.quantidade_a_comprar,0,'pendente','Gerado pelo planejamento em cadeia',auth.uid(),true
 from public.producao_necessidades n join public.producao_insumos i on i.id=n.insumo_id and i.controla_estoque
 where n.quantidade_a_comprar>0
 on conflict(insumo_id,data_necessidade) where origem_automatica do update set quantidade_necessaria=excluded.quantidade_necessaria,updated_at=now(),observacoes=excluded.observacoes;
 get diagnostics total=row_count; return total;
end;$$;
revoke all on function public.sincronizar_compras_planejamento() from public;
grant execute on function public.sincronizar_compras_planejamento() to authenticated;

create or replace view public.producao_rastreabilidade as
select 'insumo'::text as fonte,m.id,m.insumo_id as referencia_id,i.nome as item,m.tipo,m.quantidade,i.unidade,m.saldo_anterior,m.saldo_posterior,m.origem_tipo,m.origem_id,m.motivo,null::text as lote,m.criado_por,m.created_at from public.producao_estoque_movimentacoes m join public.producao_insumos i on i.id=m.insumo_id
union all
select 'preparo',m.id,m.ficha_id,f.nome,m.tipo,m.quantidade,m.unidade,m.saldo_anterior,m.saldo_posterior,m.origem_tipo,m.origem_id,m.motivo,l.codigo,m.criado_por,m.created_at from public.producao_preparos_movimentacoes m join public.producao_fichas_tecnicas f on f.id=m.ficha_id left join public.producao_preparos_lotes l on l.id=m.lote_id
union all
select 'molho',m.id,m.ficha_id,f.nome,m.tipo,m.quantidade::numeric,'bisnaga '||m.tamanho,m.saldo_anterior::numeric,m.saldo_posterior::numeric,'estoque_molho',m.lote_id,m.motivo,l.codigo,m.criado_por,m.created_at from public.producao_molho_movimentacoes m join public.producao_fichas_tecnicas f on f.id=m.ficha_id left join public.producao_molho_lotes l on l.id=m.lote_id
union all
select 'salgadinho',m.id,m.produto_id,p.nome,m.tipo,m.quantidade_informada,m.unidade_informada,m.saldo_anterior,m.saldo_posterior,'estoque_final',m.lote_id,m.motivo,l.codigo,m.criado_por,m.created_at from public.producao_movimentacoes_salgadinhos m join public.producao_produtos p on p.id=m.produto_id join public.producao_lotes l on l.id=m.lote_id;
grant select on public.producao_rastreabilidade to authenticated;

create table if not exists public.producao_integracoes (
 id uuid primary key default gen_random_uuid(),nome text not null unique,status text not null check(status in ('planejada','configurando','ativa','pausada')) default 'planejada',objetivo text not null,observacoes text,updated_at timestamptz not null default now()
);
alter table public.producao_integracoes enable row level security;
create policy "Ler integracoes de producao" on public.producao_integracoes for select to authenticated using(private.usuario_pode_acessar('producao_planejamento') or private.usuario_pode_acessar('producao_estoque'));
insert into public.producao_integracoes(nome,status,objetivo,observacoes) values
('Saipos Data API','planejada','Importar vendas estruturadas, cancelamentos e baixar estoque sem interpretar texto livre.','Ativar somente após homologação com loja demo, códigos estáveis e idempotência.'),
('Evolution API','planejada','Conectar eventos do WhatsApp a pedidos, atendimento e rastreamento de conversões.','Não deve movimentar estoque sem vínculo estruturado com pedido e item.'),
('iFood via Saipos','planejada','Receber pedidos integrados pela origem estruturada da Saipos.','Testar promoções, complementos, alterações e cancelamentos.'),
('n8n','planejada','Orquestrar alertas, relatórios e integrações sem concentrar regra crítica de estoque fora do ERP.','Regras de saldo permanecem nas RPCs transacionais do Supabase.')
on conflict(nome) do update set objetivo=excluded.objetivo,observacoes=excluded.observacoes;