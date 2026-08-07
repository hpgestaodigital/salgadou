-- Configuração segura da OpenAI para o leitor de notas.

create or replace function public.erp_set_openai_api_key(secret_value text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_id uuid;
begin
  if secret_value is null or length(btrim(secret_value)) < 20 then
    raise exception 'API Key inválida';
  end if;

  select id into v_id from vault.secrets where name = 'salgadou_openai_api_key' limit 1;
  if v_id is null then
    perform vault.create_secret(btrim(secret_value), 'salgadou_openai_api_key', 'OpenAI API Key do ERP Salgadou', null);
  else
    perform vault.update_secret(v_id, btrim(secret_value), 'salgadou_openai_api_key', 'OpenAI API Key do ERP Salgadou', null);
  end if;
end;
$$;

create or replace function public.erp_get_openai_api_key()
returns text
language sql
security definer
set search_path = pg_catalog, public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'salgadou_openai_api_key'
  limit 1;
$$;

revoke all on function public.erp_set_openai_api_key(text) from public, anon, authenticated;
revoke all on function public.erp_get_openai_api_key() from public, anon, authenticated;
grant execute on function public.erp_set_openai_api_key(text) to service_role;
grant execute on function public.erp_get_openai_api_key() to service_role;

insert into public.configuracoes (chave, valor)
values
  ('openai_invoice_model', 'gpt-4.1-mini'),
  ('openai_invoice_enabled', 'true')
on conflict (chave) do nothing;
