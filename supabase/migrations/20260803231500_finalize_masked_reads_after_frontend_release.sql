-- APLICAR SOMENTE DEPOIS que o front-end da v1.0 estiver em produção.
-- Remove a compatibilidade temporária concedida à versão anterior da aplicação.

revoke select on table public.colaboradores from authenticated;
grant select (id, nome, tipo, funcao, ativo, created_at, notificacoes_whatsapp, participa_escala)
  on table public.colaboradores to authenticated;

revoke select on table public.motoboys from authenticated;
grant select (id, nome, ativo, created_at)
  on table public.motoboys to authenticated;

revoke select on table public.fornecedores from authenticated;
grant select (id, nome, ativo, created_at)
  on table public.fornecedores to authenticated;

revoke select on table public.pagamentos_fornecedores from authenticated;
grant select (id, pedido, vencimento, fornecedor, valor, pago_em, responsavel, created_at)
  on table public.pagamentos_fornecedores to authenticated;

revoke select on table public.pagamentos_motoboys from authenticated;
grant select (
  id, data, motoboy_id, motoboy_nome, numero_entregas, valor_taxas,
  valor_diaria, total, pago_em, responsavel, created_at
) on table public.pagamentos_motoboys to authenticated;

notify pgrst, 'reload schema';
