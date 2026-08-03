-- Produção intermediária de massas e recheios, com consumo em cadeia e planejamento.

alter table public.producao_fichas_tecnicas
  add column if not exists capacidade_unidades_aprox numeric(14,4),
  add column if not exists modo_preparo text;

alter table public.producao_produtos
  add column if not exists ficha_tecnica_id uuid references public.producao_fichas_tecnicas(id);

create index if not exists producao_produtos_ficha_idx
  on public.producao_produtos(ficha_tecnica_id);

create table if not exists public.producao_preparos_lotes (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.producao_fichas_tecnicas(id),
  codigo text not null unique,
  data_producao date not null default current_date,
  receitas_produzidas numeric(14,4) not null check (receitas_produzidas > 0),
  quantidade_prevista numeric(14,4) not null check (quantidade_prevista > 0),
  quantidade_produzida numeric(14,4) not null check (quantidade_produzida > 0),
  quantidade_disponivel numeric(14,4) not null check (quantidade_disponivel >= 0),
  unidade text not null check (unidade in ('un','g','kg','ml','l')),
  observacoes text,
  criado_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists producao_preparos_lotes_fifo_idx
  on public.producao_preparos_lotes(ficha_id, data_producao, created_at)
  where quantidade_disponivel > 0;

create table if not exists public.producao_preparos_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.producao_fichas_tecnicas(id),
  lote_id uuid references public.producao_preparos_lotes(id),
  tipo text not null check (tipo in ('entrada','saida','ajuste')),
  quantidade numeric(14,4) not null check (quantidade > 0),
  unidade text not null check (unidade in ('un','g','kg','ml','l')),
  saldo_anterior numeric(14,4) not null,
  saldo_posterior numeric(14,4) not null,
  origem_tipo text not null,
  origem_id uuid,
  motivo text not null,
  observacoes text,
  criado_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.producao_preparos_lotes enable row level security;
alter table public.producao_preparos_movimentacoes enable row level security;

create policy "Ler lotes de preparos" on public.producao_preparos_lotes
for select to authenticated
using (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'));

create policy "Ler movimentacoes de preparos" on public.producao_preparos_movimentacoes
for select to authenticated
using (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'));

revoke insert, update, delete on public.producao_preparos_lotes from authenticated;
revoke insert, update, delete on public.producao_preparos_movimentacoes from authenticated;

create or replace function private.converter_unidade_producao(
  valor numeric,
  unidade_origem text,
  unidade_destino text
)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog, public, private
as $$
begin
  if unidade_origem = unidade_destino then return valor; end if;
  if unidade_origem = 'g' and unidade_destino = 'kg' then return valor / 1000; end if;
  if unidade_origem = 'kg' and unidade_destino = 'g' then return valor * 1000; end if;
  if unidade_origem = 'ml' and unidade_destino = 'l' then return valor / 1000; end if;
  if unidade_origem = 'l' and unidade_destino = 'ml' then return valor * 1000; end if;
  raise exception 'Unidades incompatíveis: % e %', unidade_origem, unidade_destino;
end;
$$;

create or replace function private.consumir_preparo_fifo(
  ficha_id_param uuid,
  quantidade_param numeric,
  unidade_param text,
  origem_tipo_param text,
  origem_id_param uuid,
  motivo_param text,
  observacoes_param text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  lote record;
  restante numeric(14,4) := quantidade_param;
  disponivel_convertido numeric(14,4);
  consumir_destino numeric(14,4);
  consumir_lote numeric(14,4);
begin
  if quantidade_param <= 0 then return; end if;

  for lote in
    select * from public.producao_preparos_lotes
    where ficha_id = ficha_id_param and quantidade_disponivel > 0
    order by data_producao, created_at
    for update
  loop
    exit when restante <= 0;
    disponivel_convertido := private.converter_unidade_producao(lote.quantidade_disponivel, lote.unidade, unidade_param);
    consumir_destino := least(restante, disponivel_convertido);
    consumir_lote := private.converter_unidade_producao(consumir_destino, unidade_param, lote.unidade);

    update public.producao_preparos_lotes
      set quantidade_disponivel = quantidade_disponivel - consumir_lote
      where id = lote.id;

    insert into public.producao_preparos_movimentacoes(
      ficha_id,lote_id,tipo,quantidade,unidade,saldo_anterior,saldo_posterior,
      origem_tipo,origem_id,motivo,observacoes,criado_por
    ) values (
      ficha_id_param,lote.id,'saida',consumir_lote,lote.unidade,
      lote.quantidade_disponivel,lote.quantidade_disponivel-consumir_lote,
      origem_tipo_param,origem_id_param,motivo_param,nullif(btrim(observacoes_param),''),auth.uid()
    );

    restante := restante - consumir_destino;
  end loop;

  if restante > 0.0001 then
    raise exception 'Estoque insuficiente do preparo. Faltam % %', restante, unidade_param;
  end if;
end;
$$;

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
  saldo numeric(14,4);
  lote_id uuid;
  lote_codigo text;
begin
  if auth.uid() is null or not (
    private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')
  ) then raise exception 'Acesso negado'; end if;
  if receitas_param is null or receitas_param <= 0 then raise exception 'Informe quantas receitas foram produzidas'; end if;
  if quantidade_real_param is null or quantidade_real_param <= 0 then raise exception 'Informe o rendimento real'; end if;

  select * into ficha from public.producao_fichas_tecnicas
  where id=ficha_id_param and categoria in ('massa','recheio') and ativo;
  if not found then raise exception 'Ficha de massa ou recheio não encontrada'; end if;
  perform private.converter_unidade_producao(quantidade_real_param, unidade_param, ficha.unidade_rendimento);

  if not exists (select 1 from public.producao_ficha_itens where ficha_id=ficha_id_param) then
    raise exception 'Cadastre os ingredientes ou componentes antes de produzir';
  end if;

  for item in select * from public.producao_ficha_itens where ficha_id=ficha_id_param order by created_at loop
    necessario := item.quantidade * receitas_param;
    if item.insumo_id is not null then
      select * into insumo from public.producao_insumos where id=item.insumo_id for update;
      necessario_insumo := private.converter_unidade_producao(necessario, item.unidade, insumo.unidade);
      saldo := insumo.estoque_atual;
      if saldo < necessario_insumo then
        raise exception 'Saldo insuficiente de %. Necessário: % %, disponível: % %', insumo.nome, necessario_insumo, insumo.unidade, saldo, insumo.unidade;
      end if;
      update public.producao_insumos set estoque_atual=saldo-necessario_insumo, updated_at=now() where id=insumo.id;
      insert into public.producao_estoque_movimentacoes(
        insumo_id,tipo,quantidade,saldo_anterior,saldo_posterior,origem_tipo,origem_id,motivo,observacoes,criado_por
      ) values (
        insumo.id,'saida',necessario_insumo,saldo,saldo-necessario_insumo,'producao_preparo',ficha_id_param,
        'Produção de '||ficha.nome,nullif(btrim(observacoes_param),''),auth.uid()
      );
    else
      perform private.consumir_preparo_fifo(
        item.componente_ficha_id,necessario,item.unidade,'producao_preparo',ficha_id_param,
        'Componente utilizado na produção de '||ficha.nome,observacoes_param
      );
    end if;
  end loop;

  lote_codigo := 'PRE-'||to_char(coalesce(data_param,current_date),'YYYYMMDD')||'-'||upper(substr(replace(ficha.nome,' ',''),1,4))||'-'||substr(gen_random_uuid()::text,1,4);
  insert into public.producao_preparos_lotes(
    ficha_id,codigo,data_producao,receitas_produzidas,quantidade_prevista,
    quantidade_produzida,quantidade_disponivel,unidade,observacoes,criado_por
  ) values (
    ficha_id_param,lote_codigo,coalesce(data_param,current_date),receitas_param,
    ficha.rendimento_padrao*receitas_param,quantidade_real_param,quantidade_real_param,
    unidade_param,nullif(btrim(observacoes_param),''),auth.uid()
  ) returning id into lote_id;

  insert into public.producao_preparos_movimentacoes(
    ficha_id,lote_id,tipo,quantidade,unidade,saldo_anterior,saldo_posterior,
    origem_tipo,origem_id,motivo,observacoes,criado_por
  ) values (
    ficha_id_param,lote_id,'entrada',quantidade_real_param,unidade_param,0,quantidade_real_param,
    'producao_preparo',lote_id,'Produção de '||ficha.nome,nullif(btrim(observacoes_param),''),auth.uid()
  );

  return lote_id;
end;
$$;

revoke all on function public.registrar_producao_preparo(uuid,numeric,numeric,text,date,text) from public;
grant execute on function public.registrar_producao_preparo(uuid,numeric,numeric,text,date,text) to authenticated;

create or replace function public.registrar_consumo_salgado(
  ficha_id_param uuid,
  quantidade_unidades_param numeric,
  origem_id_param uuid default null,
  observacoes_param text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  ficha record;
  item record;
  fator numeric(14,8);
begin
  if auth.uid() is null or not (
    private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')
  ) then raise exception 'Acesso negado'; end if;
  if quantidade_unidades_param is null or quantidade_unidades_param <= 0 then raise exception 'Informe a quantidade produzida'; end if;

  select * into ficha from public.producao_fichas_tecnicas
  where id=ficha_id_param and categoria='salgado' and ativo;
  if not found then raise exception 'Ficha de salgado não encontrada'; end if;
  if ficha.unidade_rendimento <> 'un' then raise exception 'A ficha do salgado deve render em unidades'; end if;

  fator := quantidade_unidades_param / ficha.rendimento_padrao;
  for item in select * from public.producao_ficha_itens where ficha_id=ficha_id_param order by created_at loop
    if item.componente_ficha_id is null then
      raise exception 'Salgados devem consumir massa e recheio prontos, não insumos diretamente';
    end if;
    perform private.consumir_preparo_fifo(
      item.componente_ficha_id,item.quantidade*fator,item.unidade,
      'producao_salgado',origem_id_param,'Produção de '||ficha.nome,observacoes_param
    );
  end loop;
end;
$$;

revoke all on function public.registrar_consumo_salgado(uuid,numeric,uuid,text) from public;
grant execute on function public.registrar_consumo_salgado(uuid,numeric,uuid,text) to authenticated;

create or replace view public.producao_estoque_preparos as
select
  f.id as ficha_id,
  f.nome,
  f.categoria,
  f.unidade_rendimento as unidade,
  coalesce(sum(private.converter_unidade_producao(l.quantidade_disponivel,l.unidade,f.unidade_rendimento)),0)::numeric(14,4) as quantidade_disponivel,
  max(l.data_producao) as ultima_producao
from public.producao_fichas_tecnicas f
left join public.producao_preparos_lotes l on l.ficha_id=f.id and l.quantidade_disponivel>0
where f.categoria in ('massa','recheio') and f.ativo
group by f.id,f.nome,f.categoria,f.unidade_rendimento;

grant select on public.producao_estoque_preparos to authenticated;

create or replace view public.producao_necessidades as
with recursive cadeia as (
  select
    p.id as planejamento_id,
    p.data_producao,
    p.produto_id,
    pr.ficha_tecnica_id as ficha_id,
    (p.quantidade / nullif(f.rendimento_padrao,0))::numeric as receitas,
    array[pr.ficha_tecnica_id]::uuid[] as caminho
  from public.producao_planejamento p
  join public.producao_produtos pr on pr.id=p.produto_id
  join public.producao_fichas_tecnicas f on f.id=pr.ficha_tecnica_id and f.categoria='salgado'
  where p.status in ('planejado','em_producao')

  union all

  select
    c.planejamento_id,
    c.data_producao,
    c.produto_id,
    fi.componente_ficha_id,
    ((c.receitas*fi.quantidade - coalesce(ep.quantidade_disponivel,0)) / nullif(cf.rendimento_padrao,0))::numeric,
    c.caminho||fi.componente_ficha_id
  from cadeia c
  join public.producao_ficha_itens fi on fi.ficha_id=c.ficha_id and fi.componente_ficha_id is not null
  join public.producao_fichas_tecnicas cf on cf.id=fi.componente_ficha_id
  left join public.producao_estoque_preparos ep on ep.ficha_id=fi.componente_ficha_id
  where not fi.componente_ficha_id = any(c.caminho)
    and (c.receitas*fi.quantidade - coalesce(ep.quantidade_disponivel,0)) > 0
), necessidades_cadeia as (
  select
    c.data_producao,
    i.id as insumo_id,
    i.nome as insumo,
    i.unidade,
    sum(private.converter_unidade_producao(c.receitas*fi.quantidade,fi.unidade,i.unidade))::numeric(14,3) as quantidade_necessaria,
    i.estoque_atual
  from cadeia c
  join public.producao_ficha_itens fi on fi.ficha_id=c.ficha_id and fi.insumo_id is not null
  join public.producao_insumos i on i.id=fi.insumo_id and i.ativo
  group by c.data_producao,i.id,i.nome,i.unidade,i.estoque_atual
), necessidades_legadas as (
  select
    p.data_producao,
    i.id as insumo_id,
    i.nome as insumo,
    i.unidade,
    sum(p.quantidade*r.quantidade_por_unidade)::numeric(14,3) as quantidade_necessaria,
    i.estoque_atual
  from public.producao_planejamento p
  join public.producao_produtos pr on pr.id=p.produto_id and pr.ficha_tecnica_id is null
  join public.producao_receitas r on r.produto_id=p.produto_id
  join public.producao_insumos i on i.id=r.insumo_id and i.ativo
  where p.status in ('planejado','em_producao')
  group by p.data_producao,i.id,i.nome,i.unidade,i.estoque_atual
), unificado as (
  select * from necessidades_cadeia
  union all
  select * from necessidades_legadas
)
select
  data_producao,insumo_id,insumo,unidade,
  sum(quantidade_necessaria)::numeric(14,3) as quantidade_necessaria,
  max(estoque_atual)::numeric(14,3) as estoque_atual,
  greatest(sum(quantidade_necessaria)-max(estoque_atual),0)::numeric(14,3) as quantidade_a_comprar
from unificado
group by data_producao,insumo_id,insumo,unidade;

grant select on public.producao_necessidades to authenticated;
