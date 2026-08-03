-- As duas views dependem das colunas de quantidade dos lotes e movimentações de molho.
-- Elas são recriadas depois que essas colunas passam a aceitar valores fracionados.
drop view if exists public.producao_rastreabilidade;
drop view if exists public.producao_estoque_molhos;
