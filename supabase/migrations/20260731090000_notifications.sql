alter table public.colaboradores
  add column if not exists notificacoes_whatsapp boolean not null default true;

create table if not exists public.notificacoes_log (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  evento text not null,
  referencia_tipo text not null,
  referencia_id uuid not null,
  destinatario_nome text,
  destinatario_numero text,
  status text not null check (status in ('processando', 'enviado', 'falhou', 'ignorado')),
  erro text,
  enviado_em timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notificacoes_log enable row level security;
drop policy if exists "Autenticados leem logs de notificações" on public.notificacoes_log;
create policy "Autenticados leem logs de notificações"
  on public.notificacoes_log for select to authenticated using (true);

insert into public.configuracoes (chave, valor) values
  ('notificacoes_ativas', 'false'),
  ('notificacoes_antecedencia_dias', '3')
on conflict (chave) do nothing;
