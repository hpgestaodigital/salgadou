-- Fechamento de segurança da ERP V1.
-- RPCs SECURITY DEFINER usadas pelo app devem exigir sessão autenticada.

revoke execute on function public.listar_motoboys() from public;
grant execute on function public.listar_motoboys() to authenticated;

revoke execute on function public.listar_pagamentos_fornecedores() from public;
grant execute on function public.listar_pagamentos_fornecedores() to authenticated;

revoke execute on function public.resumo_vencidos_anteriores_dashboard() from public;
grant execute on function public.resumo_vencidos_anteriores_dashboard() to authenticated;

revoke execute on function public.sincronizar_reuniao_com_kanban() from public;
grant execute on function public.sincronizar_reuniao_com_kanban() to authenticated;
