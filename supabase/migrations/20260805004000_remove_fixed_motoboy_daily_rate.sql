-- A diária do motoboy varia livremente em cada lançamento de pagamento.
-- O campo legado permanece por compatibilidade, mas deixa de fornecer valor padrão.
update public.motoboys
set valor_diaria = 0
where coalesce(valor_diaria, 0) <> 0;

alter table public.motoboys
  alter column valor_diaria set default 0;

comment on column public.motoboys.valor_diaria is
  'Campo legado mantido por compatibilidade. A diária válida é informada em pagamentos_motoboys.valor_diaria para cada lançamento.';
