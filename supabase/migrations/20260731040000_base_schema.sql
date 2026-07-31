-- Esquema-base do ERP Salgadou para um projeto Supabase novo.
-- Deve ser aplicado antes das migrações 20260731050000 e 20260731060000.

create extension if not exists pgcrypto;

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text,
  tipo text,
  valor_diaria numeric(12,2),
  funcao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.motoboys (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  pix text,
  whatsapp text,
  valor_diaria numeric(12,2),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.escala (
  id uuid primary key default gen_random_uuid(),
  semana_inicio date not null,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  seg text,
  ter text,
  qua text,
  qui text,
  sex text,
  sab text,
  dom text,
  observacoes text,
  created_at timestamptz not null default now(),
  unique (semana_inicio, colaborador_id)
);

create table if not exists public.pagamentos_fornecedores (
  id uuid primary key default gen_random_uuid(),
  pedido text,
  vencimento date not null,
  fornecedor text not null,
  valor numeric(12,2) not null default 0,
  observacao text,
  pago_em date,
  comprovante text,
  responsavel text,
  created_at timestamptz not null default now()
);

create table if not exists public.pagamentos_motoboys (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  motoboy_id uuid references public.motoboys(id) on delete set null,
  motoboy_nome text,
  numero_entregas integer,
  valor_taxas numeric(12,2),
  valor_diaria numeric(12,2),
  total numeric(12,2),
  pix text,
  pago_em date,
  observacao text,
  created_at timestamptz not null default now()
);

create table if not exists public.configuracoes (
  chave text primary key,
  valor text,
  updated_at timestamptz not null default now()
);

alter table public.colaboradores enable row level security;
alter table public.motoboys enable row level security;
alter table public.fornecedores enable row level security;
alter table public.escala enable row level security;
alter table public.pagamentos_fornecedores enable row level security;
alter table public.pagamentos_motoboys enable row level security;
alter table public.configuracoes enable row level security;

drop policy if exists "Autenticados gerenciam colaboradores" on public.colaboradores;
create policy "Autenticados gerenciam colaboradores" on public.colaboradores
  for all to authenticated using (true) with check (true);

drop policy if exists "Autenticados gerenciam motoboys" on public.motoboys;
create policy "Autenticados gerenciam motoboys" on public.motoboys
  for all to authenticated using (true) with check (true);

drop policy if exists "Autenticados gerenciam fornecedores" on public.fornecedores;
create policy "Autenticados gerenciam fornecedores" on public.fornecedores
  for all to authenticated using (true) with check (true);

drop policy if exists "Autenticados gerenciam escala" on public.escala;
create policy "Autenticados gerenciam escala" on public.escala
  for all to authenticated using (true) with check (true);

drop policy if exists "Autenticados gerenciam pagamentos de fornecedores" on public.pagamentos_fornecedores;
create policy "Autenticados gerenciam pagamentos de fornecedores" on public.pagamentos_fornecedores
  for all to authenticated using (true) with check (true);

drop policy if exists "Autenticados gerenciam pagamentos de motoboys" on public.pagamentos_motoboys;
create policy "Autenticados gerenciam pagamentos de motoboys" on public.pagamentos_motoboys
  for all to authenticated using (true) with check (true);

drop policy if exists "Autenticados gerenciam configurações" on public.configuracoes;
create policy "Autenticados gerenciam configurações" on public.configuracoes
  for all to authenticated using (true) with check (true);

create index if not exists colaboradores_nome_idx on public.colaboradores (nome);
create index if not exists motoboys_nome_idx on public.motoboys (nome);
create index if not exists fornecedores_nome_idx on public.fornecedores (nome);
create index if not exists pagamentos_fornecedores_vencimento_idx on public.pagamentos_fornecedores (vencimento);
create index if not exists pagamentos_motoboys_data_idx on public.pagamentos_motoboys (data);
