-- O saldo físico passa a ser alterado somente pelas RPCs e funções internas
-- que registram a movimentação no extrato.

revoke update, delete, truncate on table public.producao_insumos from authenticated;

grant update (nome, unidade, estoque_minimo, ativo, updated_at)
  on table public.producao_insumos to authenticated;

-- SELECT e INSERT continuam permitidos conforme RLS. O INSERT pode informar
-- saldo inicial, que é capturado automaticamente pelo trigger do extrato.
