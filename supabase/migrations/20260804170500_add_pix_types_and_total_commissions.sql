alter table public.motoboys
  add column if not exists pix_tipo text;

alter table public.fornecedores
  add column if not exists pix text,
  add column if not exists pix_tipo text;

alter table public.colaboradores
  add column if not exists pix text,
  add column if not exists pix_tipo text;

alter table public.pagamentos_motoboys
  add column if not exists pix_tipo text;

alter table public.motoboys
  drop constraint if exists motoboys_pix_tipo_check;
alter table public.motoboys
  add constraint motoboys_pix_tipo_check
  check (pix_tipo is null or pix_tipo in ('cpf', 'celular', 'email', 'cnpj', 'aleatoria'));

alter table public.fornecedores
  drop constraint if exists fornecedores_pix_tipo_check;
alter table public.fornecedores
  add constraint fornecedores_pix_tipo_check
  check (pix_tipo is null or pix_tipo in ('cpf', 'celular', 'email', 'cnpj', 'aleatoria'));

alter table public.colaboradores
  drop constraint if exists colaboradores_pix_tipo_check;
alter table public.colaboradores
  add constraint colaboradores_pix_tipo_check
  check (pix_tipo is null or pix_tipo in ('cpf', 'celular', 'email', 'cnpj', 'aleatoria'));

alter table public.pagamentos_motoboys
  drop constraint if exists pagamentos_motoboys_pix_tipo_check;
alter table public.pagamentos_motoboys
  add constraint pagamentos_motoboys_pix_tipo_check
  check (pix_tipo is null or pix_tipo in ('cpf', 'celular', 'email', 'cnpj', 'aleatoria'));

-- O campo valor_taxas passa a representar o valor total de comissões.
-- Preserva o total histórico já calculado ao converter o valor antigo por entrega.
update public.pagamentos_motoboys
set valor_taxas = coalesce(numero_entregas, 0) * coalesce(valor_taxas, 0)
where coalesce(numero_entregas, 0) > 0
  and coalesce(valor_taxas, 0) > 0
  and abs(coalesce(total, 0) - (coalesce(valor_diaria, 0) + coalesce(numero_entregas, 0) * coalesce(valor_taxas, 0))) < 0.01;

update public.pagamentos_motoboys p
set pix_tipo = m.pix_tipo
from public.motoboys m
where p.motoboy_id = m.id
  and p.pix_tipo is null;

comment on column public.pagamentos_motoboys.valor_taxas is 'Valor total de comissões do motoboy no dia';
comment on column public.pagamentos_motoboys.pix_tipo is 'Tipo da chave PIX armazenada no lançamento';