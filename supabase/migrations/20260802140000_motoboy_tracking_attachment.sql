-- Segundo anexo opcional do fechamento do motoboy: resumo do sistema de rastreio.
alter table public.pagamentos_motoboys
  add column if not exists rastreio_anexo_url text,
  add column if not exists rastreio_anexo_path text;

grant select, insert, update, delete on public.pagamentos_motoboys to authenticated, service_role;
