-- Função auxiliar usada apenas por RPCs autenticadas; não deve ficar exposta para anon.
revoke execute on function public.gerar_codigo_lote(date,uuid) from public, anon;
grant execute on function public.gerar_codigo_lote(date,uuid) to authenticated;