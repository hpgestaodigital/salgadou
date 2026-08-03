create view public.producao_rastreabilidade
with (security_invoker = true)
as
select
  'insumo'::text as fonte,
  m.id,
  m.insumo_id as referencia_id,
  i.nome as item,
  m.tipo,
  m.quantidade,
  i.unidade,
  m.saldo_anterior,
  m.saldo_posterior,
  m.origem_tipo,
  m.origem_id,
  m.motivo,
  null::text as lote,
  m.criado_por,
  m.created_at
from public.producao_estoque_movimentacoes m
join public.producao_insumos i on i.id = m.insumo_id

union all

select
  'preparo'::text as fonte,
  m.id,
  m.ficha_id as referencia_id,
  f.nome as item,
  m.tipo,
  m.quantidade,
  m.unidade,
  m.saldo_anterior,
  m.saldo_posterior,
  m.origem_tipo,
  m.origem_id,
  m.motivo,
  l.codigo as lote,
  m.criado_por,
  m.created_at
from public.producao_preparos_movimentacoes m
join public.producao_fichas_tecnicas f on f.id = m.ficha_id
left join public.producao_preparos_lotes l on l.id = m.lote_id

union all

select
  'molho'::text as fonte,
  m.id,
  m.ficha_id as referencia_id,
  f.nome as item,
  m.tipo,
  m.quantidade,
  'bisnaga '::text || m.tamanho as unidade,
  m.saldo_anterior,
  m.saldo_posterior,
  'estoque_molho'::text as origem_tipo,
  m.lote_id as origem_id,
  m.motivo,
  l.codigo as lote,
  m.criado_por,
  m.created_at
from public.producao_molho_movimentacoes m
join public.producao_fichas_tecnicas f on f.id = m.ficha_id
left join public.producao_molho_lotes l on l.id = m.lote_id

union all

select
  'salgadinho'::text as fonte,
  m.id,
  m.produto_id as referencia_id,
  p.nome as item,
  m.tipo,
  m.quantidade_informada as quantidade,
  m.unidade_informada as unidade,
  m.saldo_anterior,
  m.saldo_posterior,
  'estoque_final'::text as origem_tipo,
  m.lote_id as origem_id,
  m.motivo,
  l.codigo as lote,
  m.criado_por,
  m.created_at
from public.producao_movimentacoes_salgadinhos m
join public.producao_produtos p on p.id = m.produto_id
join public.producao_lotes l on l.id = m.lote_id;

grant select on public.producao_rastreabilidade to authenticated;
revoke all on public.producao_rastreabilidade from anon;
