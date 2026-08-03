-- Separa estoque de insumos do estoque de salgadinhos e registra o rendimento por lote.

create table if not exists public.producao_lotes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  planejamento_id uuid not null unique references public.producao_planejamento(id) on delete restrict,
  produto_id uuid not null references public.producao_produtos(id) on delete restrict,
  data_producao date not null,
  status text not null default 'congelado' check (status in ('congelado', 'empacotado', 'encerrado')),
  quantidade_planejada numeric(14,4) not null default 0 check (quantidade_planejada >= 0),
  quantidade_saida_maquina numeric(14,4) not null default 0 check (quantidade_saida_maquina >= 0),
  caixas_produzidas numeric(14,4) not null default 0 check (caixas_produzidas >= 0),
  caixas_empacotadas numeric(14,4) not null default 0 check (caixas_empacotadas >= 0),
  porcoes_produzidas numeric(14,4) not null default 0 check (porcoes_produzidas >= 0),
  porcoes_disponiveis numeric(14,4) not null default 0 check (porcoes_disponiveis >= 0),
  observacoes text,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists producao_lotes_produto_data_idx
  on public.producao_lotes (produto_id, data_producao desc);
create index if not exists producao_lotes_status_idx
  on public.producao_lotes (status, data_producao desc);

alter table public.producao_lotes enable row level security;

drop policy if exists "producao_lotes_select" on public.producao_lotes;
create policy "producao_lotes_select" on public.producao_lotes
for select to authenticated
using (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'));

drop policy if exists "producao_lotes_write" on public.producao_lotes;
create policy "producao_lotes_write" on public.producao_lotes
for all to authenticated
using (private.usuario_pode_acessar('producao_planejamento'))
with check (private.usuario_pode_acessar('producao_planejamento'));

grant select on public.producao_lotes to authenticated;
revoke insert, update, delete, truncate on public.producao_lotes from authenticated;

create or replace function public.gerar_codigo_lote(data_param date, produto_id_param uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  prefixo text;
  sequencia integer;
begin
  select upper(left(regexp_replace(nome, '[^A-Za-z0-9]+', '', 'g'), 3))
    into prefixo
  from public.producao_produtos
  where id = produto_id_param;
  prefixo := coalesce(nullif(prefixo, ''), 'LOT');

  select count(*) + 1 into sequencia
  from public.producao_lotes
  where data_producao = data_param and produto_id = produto_id_param;

  return prefixo || '-' || to_char(data_param, 'YYYYMMDD') || '-' || lpad(sequencia::text, 3, '0');
end;
$$;

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
begin
  if (select auth.uid()) is null or not private.usuario_pode_acessar('producao_planejamento') then
    raise exception 'Acesso negado';
  end if;
  if estimativa_unidades_param is null or estimativa_unidades_param <= 0 then
    raise exception 'Informe uma quantidade produzida maior que zero';
  end if;
  if caixas_produzidas_param is null or caixas_produzidas_param <= 0 then
    raise exception 'Informe quantas caixas foram produzidas';
  end if;

  select id, produto_id, data_producao, quantidade, status into plano
  from public.producao_planejamento
  where id = planejamento_id_param
  for update;

  if plano.id is null then raise exception 'Produção não encontrada'; end if;
  if plano.status <> 'planejado' then raise exception 'A saída da máquina já foi registrada para esta produção'; end if;

  for consumo in select value from jsonb_array_elements(coalesce(consumos_param, '[]'::jsonb)) loop
    if not exists (
      select 1 from public.producao_receitas
      where produto_id = plano.produto_id and insumo_id = (consumo ->> 'insumo_id')::uuid
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

  codigo_lote := public.gerar_codigo_lote(plano.data_producao, plano.produto_id);

  insert into public.producao_lotes (
    codigo, planejamento_id, produto_id, data_producao, status,
    quantidade_planejada, quantidade_saida_maquina, caixas_produzidas,
    observacoes, criado_por
  ) values (
    codigo_lote, plano.id, plano.produto_id, plano.data_producao, 'congelado',
    plano.quantidade, estimativa_unidades_param, caixas_produzidas_param,
    nullif(btrim(observacoes_param), ''), (select auth.uid())
  );

  update public.producao_planejamento
  set status = 'em_producao',
      quantidade_produzida = estimativa_unidades_param,
      caixas_produzidas = caixas_produzidas_param,
      observacoes_fechamento = nullif(btrim(observacoes_param), ''),
      saida_maquina_em = now(), concluido_em = null, concluido_por = null, updated_at = now()
  where id = planejamento_id_param;
end;
$$;

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
  lote_id uuid;
begin
  if (select auth.uid()) is null or not private.usuario_pode_acessar('producao_planejamento') then
    raise exception 'Acesso negado';
  end if;
  if caixas_empacotadas_param is null or caixas_empacotadas_param <= 0 then
    raise exception 'Informe quantas caixas foram empacotadas';
  end if;
  if porcoes_empacotadas_param is null or porcoes_empacotadas_param <= 0 then
    raise exception 'Informe quantas porções o lote rendeu';
  end if;

  select caixas_produzidas into caixas_disponiveis
  from public.producao_planejamento
  where id = planejamento_id_param and status = 'em_producao'
  for update;
  if caixas_disponiveis is null then raise exception 'Registre primeiro a saída da máquina'; end if;
  if caixas_empacotadas_param > caixas_disponiveis then
    raise exception 'As caixas empacotadas não podem superar as caixas produzidas';
  end if;

  select id into lote_id from public.producao_lotes
  where planejamento_id = planejamento_id_param for update;
  if lote_id is null then raise exception 'Lote da produção não encontrado'; end if;

  update public.producao_lotes
  set status = 'empacotado',
      caixas_empacotadas = caixas_empacotadas_param,
      porcoes_produzidas = porcoes_empacotadas_param,
      porcoes_disponiveis = porcoes_empacotadas_param,
      observacoes = case
        when nullif(btrim(observacoes_param), '') is null then observacoes
        when observacoes is null then btrim(observacoes_param)
        else observacoes || E'\nEmpacotamento: ' || btrim(observacoes_param)
      end,
      updated_at = now()
  where id = lote_id;

  update public.producao_planejamento
  set status = 'concluido', caixas_empacotadas = caixas_empacotadas_param,
      porcoes_empacotadas = porcoes_empacotadas_param,
      observacoes_fechamento = case
        when nullif(btrim(observacoes_param), '') is null then observacoes_fechamento
        when observacoes_fechamento is null then btrim(observacoes_param)
        else observacoes_fechamento || E'\nEmpacotamento: ' || btrim(observacoes_param)
      end,
      empacotamento_em = now(), concluido_em = now(), concluido_por = (select auth.uid()), updated_at = now()
  where id = planejamento_id_param;
end;
$$;

-- Migra produções antigas para lotes sem alterar os totais existentes.
insert into public.producao_lotes (
  codigo, planejamento_id, produto_id, data_producao, status,
  quantidade_planejada, quantidade_saida_maquina, caixas_produzidas,
  caixas_empacotadas, porcoes_produzidas, porcoes_disponiveis,
  observacoes, criado_por, created_at, updated_at
)
select
  'LEG-' || to_char(p.data_producao, 'YYYYMMDD') || '-' || substr(p.id::text, 1, 8),
  p.id, p.produto_id, p.data_producao,
  case when p.status = 'concluido' then 'empacotado' else 'congelado' end,
  p.quantidade, coalesce(p.quantidade_produzida, 0), coalesce(p.caixas_produzidas, 0),
  coalesce(p.caixas_empacotadas, 0), coalesce(p.porcoes_empacotadas, 0), coalesce(p.porcoes_empacotadas, 0),
  p.observacoes_fechamento, p.criado_por, p.created_at, p.updated_at
from public.producao_planejamento p
where p.status in ('em_producao', 'concluido')
  and not exists (select 1 from public.producao_lotes l where l.planejamento_id = p.id);
