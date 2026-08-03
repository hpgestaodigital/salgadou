-- Índices para relações consultadas com frequência nos fluxos de Produção.

create index if not exists producao_consumos_insumo_idx
  on public.producao_consumos (insumo_id);

create index if not exists producao_ficha_itens_insumo_idx
  on public.producao_ficha_itens (insumo_id)
  where insumo_id is not null;

create index if not exists producao_ficha_itens_componente_idx
  on public.producao_ficha_itens (componente_ficha_id)
  where componente_ficha_id is not null;

create index if not exists producao_ficha_revisoes_ficha_idx
  on public.producao_ficha_revisoes (ficha_id)
  where ficha_id is not null;

create index if not exists producao_molho_movimentacoes_lote_idx
  on public.producao_molho_movimentacoes (lote_id)
  where lote_id is not null;

create index if not exists producao_preparos_movimentacoes_ficha_idx
  on public.producao_preparos_movimentacoes (ficha_id);

create index if not exists producao_preparos_movimentacoes_lote_idx
  on public.producao_preparos_movimentacoes (lote_id)
  where lote_id is not null;

create index if not exists producao_reservas_insumos_insumo_idx
  on public.producao_reservas_insumos (insumo_id);
