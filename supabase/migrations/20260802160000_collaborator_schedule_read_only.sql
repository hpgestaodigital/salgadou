-- Colaboradores consultam a escala, mas somente papéis de gestão podem alterá-la.
alter table public.escala enable row level security;

do $$
declare
  politica record;
begin
  for politica in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'escala'
  loop
    execute format('drop policy if exists %I on public.escala', politica.policyname);
  end loop;
end $$;

create policy "Usuários autorizados consultam escala"
  on public.escala
  for select
  to authenticated
  using (private.usuario_pode_acessar('escala'));

create policy "Gestores inserem escala"
  on public.escala
  for insert
  to authenticated
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'financeiro', 'socio')
  );

create policy "Gestores atualizam escala"
  on public.escala
  for update
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'financeiro', 'socio')
  )
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'financeiro', 'socio')
  );

create policy "Gestores excluem escala"
  on public.escala
  for delete
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'financeiro', 'socio')
  );

revoke all on table public.escala from anon;
grant select, insert, update, delete on table public.escala to authenticated, service_role;
