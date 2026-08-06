create table if not exists public.como_usar_aulas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  secao text not null,
  resumo text not null,
  video_url text not null,
  publico text not null check (publico in ('todos', 'colaborador', 'socio')),
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.como_usar_aulas enable row level security;

drop policy if exists "Autenticados visualizam aulas" on public.como_usar_aulas;
create policy "Autenticados visualizam aulas" on public.como_usar_aulas
  for select to authenticated using (ativo = true or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin' or auth.jwt() ->> 'email' = 'admin@admin.com');

drop policy if exists "Administrador gerencia aulas" on public.como_usar_aulas;
create policy "Administrador gerencia aulas" on public.como_usar_aulas
  for all to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin' or auth.jwt() ->> 'email' = 'admin@admin.com')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin' or auth.jwt() ->> 'email' = 'admin@admin.com');

create index if not exists como_usar_aulas_publico_ordem_idx on public.como_usar_aulas (publico, ordem, secao);
