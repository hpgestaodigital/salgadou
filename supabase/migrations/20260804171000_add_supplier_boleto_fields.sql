alter table public.pagamentos_fornecedores
  add column if not exists boleto_url text,
  add column if not exists boleto_path text,
  add column if not exists codigo_barras text;

comment on column public.pagamentos_fornecedores.boleto_url is 'URL legada ou externa do boleto anexado.';
comment on column public.pagamentos_fornecedores.boleto_path is 'Caminho privado do boleto no Storage.';
comment on column public.pagamentos_fornecedores.codigo_barras is 'Linha digitável ou código de barras opcional do boleto.';
