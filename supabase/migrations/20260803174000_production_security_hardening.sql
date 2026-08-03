-- Views respeitam o usuário chamador e RPCs transacionais não ficam disponíveis para anon.

alter view public.producao_estoque_preparos set (security_invoker = true);
alter view public.producao_custos_fichas set (security_invoker = true);
alter view public.producao_estoque_molhos set (security_invoker = true);
alter view public.producao_rastreabilidade set (security_invoker = true);
alter view public.producao_necessidades set (security_invoker = true);

revoke execute on function public.atualizar_ficha_tecnica(uuid,text,text,numeric,text,numeric,text,text,boolean,boolean) from public, anon;
revoke execute on function public.inativar_ficha_tecnica(uuid,text) from public, anon;
revoke execute on function public.reativar_ficha_tecnica(uuid) from public, anon;
revoke execute on function public.calcular_necessidades_producao() from public, anon;
revoke execute on function public.registrar_contagem_fisica(text,uuid,numeric,text,text) from public, anon;
revoke execute on function public.registrar_producao_molho(uuid,numeric,date,integer,integer,text) from public, anon;
revoke execute on function public.registrar_producao_preparo(uuid,numeric,numeric,text,date,text) from public, anon;
revoke execute on function public.registrar_saida_molho(uuid,text,integer,text,date,text) from public, anon;
revoke execute on function public.sincronizar_compras_planejamento() from public, anon;
revoke execute on function public.registrar_saida_maquina(uuid,numeric,numeric,text,jsonb) from public, anon;
revoke execute on function public.registrar_consumo_salgado(uuid,numeric,uuid,text) from public, anon;

-- RPCs de estoque já existentes também exigem sessão autenticada.
revoke execute on function public.ajustar_estoque_insumo(uuid,numeric,text,text) from public, anon;
revoke execute on function public.estornar_movimentacao_estoque(uuid,text) from public, anon;
revoke execute on function public.excluir_insumo_producao(uuid) from public, anon;
revoke execute on function public.registrar_entrada_estoque(uuid,numeric,text,text) from public, anon;
revoke execute on function public.registrar_saida_estoque(uuid,numeric,text,text) from public, anon;
revoke execute on function public.registrar_retirada_salgadinhos(uuid,uuid,numeric,text,numeric,text,date,text) from public, anon;
revoke execute on function public.marcar_lote_como_congelado(uuid,numeric,text) from public, anon;
revoke execute on function public.concluir_empacotamento(uuid,numeric,numeric,text) from public, anon;
revoke execute on function public.definir_status_pre_preparo(uuid,text) from public, anon;

-- Mantém apenas as operações explicitamente usadas pelo ERP para usuários autenticados.
grant execute on function public.atualizar_ficha_tecnica(uuid,text,text,numeric,text,numeric,text,text,boolean,boolean) to authenticated;
grant execute on function public.inativar_ficha_tecnica(uuid,text) to authenticated;
grant execute on function public.reativar_ficha_tecnica(uuid) to authenticated;
grant execute on function public.calcular_necessidades_producao() to authenticated;
grant execute on function public.registrar_contagem_fisica(text,uuid,numeric,text,text) to authenticated;
grant execute on function public.registrar_producao_molho(uuid,numeric,date,integer,integer,text) to authenticated;
grant execute on function public.registrar_producao_preparo(uuid,numeric,numeric,text,date,text) to authenticated;
grant execute on function public.registrar_saida_molho(uuid,text,integer,text,date,text) to authenticated;
grant execute on function public.sincronizar_compras_planejamento() to authenticated;
grant execute on function public.registrar_saida_maquina(uuid,numeric,numeric,text,jsonb) to authenticated;
grant execute on function public.registrar_consumo_salgado(uuid,numeric,uuid,text) to authenticated;
grant execute on function public.ajustar_estoque_insumo(uuid,numeric,text,text) to authenticated;
grant execute on function public.estornar_movimentacao_estoque(uuid,text) to authenticated;
grant execute on function public.excluir_insumo_producao(uuid) to authenticated;
grant execute on function public.registrar_entrada_estoque(uuid,numeric,text,text) to authenticated;
grant execute on function public.registrar_saida_estoque(uuid,numeric,text,text) to authenticated;
grant execute on function public.registrar_retirada_salgadinhos(uuid,uuid,numeric,text,numeric,text,date,text) to authenticated;
grant execute on function public.marcar_lote_como_congelado(uuid,numeric,text) to authenticated;
grant execute on function public.concluir_empacotamento(uuid,numeric,numeric,text) to authenticated;
grant execute on function public.definir_status_pre_preparo(uuid,text) to authenticated;