-- API Key da Evolution armazenada criptografada no Supabase Vault.
create or replace function public.erp_set_evolution_api_key(secret_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare secret_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Acesso negado'; end if;
  if length(trim(secret_value)) < 8 or length(secret_value) > 512 then raise exception 'Chave inválida'; end if;
  select id into secret_id from vault.decrypted_secrets where name = 'salgadou_evolution_api_key';
  if secret_id is null then
    perform vault.create_secret(trim(secret_value), 'salgadou_evolution_api_key', 'Evolution API do ERP Salgadou');
  else
    perform vault.update_secret(secret_id, trim(secret_value), 'salgadou_evolution_api_key', 'Evolution API do ERP Salgadou');
  end if;
end $$;

create or replace function public.erp_get_evolution_api_key()
returns text language sql security definer set search_path = '' stable as $$
  select case when coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    then (select decrypted_secret from vault.decrypted_secrets where name = 'salgadou_evolution_api_key' limit 1)
    else null end;
$$;

revoke all on function public.erp_set_evolution_api_key(text) from public, anon, authenticated;
revoke all on function public.erp_get_evolution_api_key() from public, anon, authenticated;
grant execute on function public.erp_set_evolution_api_key(text) to service_role;
grant execute on function public.erp_get_evolution_api_key() to service_role;
