create table if not exists public.integracoes_configuracoes (
  id text primary key,
  nome text not null,
  ativo boolean not null default false,
  configuracao jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.integracoes_configuracoes enable row level security;

drop policy if exists "Admin gerencia integrações" on public.integracoes_configuracoes;
create policy "Admin gerencia integrações"
on public.integracoes_configuracoes
for all
to authenticated
using (
  coalesce(auth.jwt() ->> 'email', '') = 'admin@admin.com'
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
)
with check (
  coalesce(auth.jwt() ->> 'email', '') = 'admin@admin.com'
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);

insert into public.integracoes_configuracoes (id, nome, configuracao)
values
  ('whatsapp_cloud', 'WhatsApp Cloud API oficial', jsonb_build_object(
    'phone_number_id', '',
    'business_account_id', '',
    'app_id', '',
    'access_token', '',
    'verify_token', '',
    'api_version', 'v23.0'
  )),
  ('n8n', 'n8n', jsonb_build_object(
    'base_url', '',
    'api_key', '',
    'webhook_url', ''
  )),
  ('webhook', 'Webhook genérico', jsonb_build_object(
    'url', '',
    'secret', ''
  ))
on conflict (id) do nothing;

create table if not exists public.integracoes_eventos (
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  payload jsonb not null,
  headers jsonb,
  recebido_em timestamptz not null default now()
);

alter table public.integracoes_eventos enable row level security;

drop policy if exists "Admin visualiza eventos de integração" on public.integracoes_eventos;
create policy "Admin visualiza eventos de integração"
on public.integracoes_eventos
for select
to authenticated
using (
  coalesce(auth.jwt() ->> 'email', '') = 'admin@admin.com'
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);

notify pgrst, 'reload schema';
