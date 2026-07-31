create table if not exists public.reunioes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  inicio timestamptz not null,
  participante_ids uuid[] not null default '{}',
  participante_nomes text[] not null default '{}',
  resumo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reunioes_itens (
  id uuid primary key default gen_random_uuid(),
  reuniao_id uuid not null references public.reunioes(id) on delete cascade,
  descricao text not null,
  responsavel_id uuid,
  responsavel_nome text,
  prazo date,
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  status text not null default 'nao_realizado' check (status in ('nao_realizado', 'em_andamento', 'concluido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reunioes_inicio_idx on public.reunioes (inicio desc);
create index if not exists reunioes_itens_reuniao_idx on public.reunioes_itens (reuniao_id);
create index if not exists reunioes_itens_status_prazo_idx on public.reunioes_itens (status, prazo);

alter table public.reunioes enable row level security;
alter table public.reunioes_itens enable row level security;

drop policy if exists "Autenticados gerenciam reuniões" on public.reunioes;
create policy "Autenticados gerenciam reuniões" on public.reunioes
  for all to authenticated using (true) with check (true);

drop policy if exists "Autenticados gerenciam itens de reuniões" on public.reunioes_itens;
create policy "Autenticados gerenciam itens de reuniões" on public.reunioes_itens
  for all to authenticated using (true) with check (true);
