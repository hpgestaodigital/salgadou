-- Fila de demandas destinadas ao setor Juridico.

create table if not exists public.demandas_juridicas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text not null,
  solicitante_id uuid not null default auth.uid(),
  solicitante_nome text not null,
  setor text,
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  status text not null default 'nao_iniciado' check (status in ('nao_iniciado', 'em_analise', 'aguardando_retorno', 'concluido')),
  prazo date,
  responsavel_id uuid,
  responsavel_nome text,
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demandas_juridicas_titulo_valido check (length(trim(titulo)) between 1 and 200),
  constraint demandas_juridicas_descricao_valida check (length(trim(descricao)) between 1 and 5000)
);

create index if not exists demandas_juridicas_status_prioridade_idx on public.demandas_juridicas (status, prioridade, prazo);
create index if not exists demandas_juridicas_solicitante_idx on public.demandas_juridicas (solicitante_id, created_at desc);

alter table public.demandas_juridicas enable row level security;

drop policy if exists "Setor juridico consulta demandas" on public.demandas_juridicas;
create policy "Setor juridico consulta demandas" on public.demandas_juridicas
  for select to authenticated using (
    (select auth.uid()) is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
  );

drop policy if exists "Setor juridico cria demandas" on public.demandas_juridicas;
create policy "Setor juridico cria demandas" on public.demandas_juridicas
  for insert to authenticated with check (
    (select auth.uid()) = solicitante_id
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
  );

drop policy if exists "Setor juridico atualiza demandas" on public.demandas_juridicas;
create policy "Setor juridico atualiza demandas" on public.demandas_juridicas
  for update to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico'))
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico'));

drop policy if exists "Setor juridico exclui demandas" on public.demandas_juridicas;
create policy "Setor juridico exclui demandas" on public.demandas_juridicas
  for delete to authenticated using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio', 'juridico')
  );

revoke all on public.demandas_juridicas from anon;
grant select, insert, update, delete on public.demandas_juridicas to authenticated, service_role;
