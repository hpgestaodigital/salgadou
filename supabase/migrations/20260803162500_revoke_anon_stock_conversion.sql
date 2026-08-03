-- A conversão de saldo é exclusiva para usuários autenticados com acesso ao estoque.
revoke execute on function public.ajustar_estoque_insumo_convertido(uuid, numeric, text, text, text) from anon;
