-- Vincula cada login ao cadastro operacional da pessoa.
-- O próprio usuário consulta seu vínculo; apenas administradores podem gerenciá-lo.

create table if not exists public.usuarios_vinculos (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  colaborador_id uuid not null unique references public.colaboradores(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.usuarios_vinculos enable row level security;

drop policy if exists "Usuário consulta o próprio vínculo" on public.usuarios_vinculos;
create policy "Usuário consulta o próprio vínculo"
  on public.usuarios_vinculos for select to authenticated
  using (
    (select auth.uid()) is not null
    and ((select auth.uid()) = usuario_id or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  );

drop policy if exists "Administrador cria vínculos" on public.usuarios_vinculos;
create policy "Administrador cria vínculos"
  on public.usuarios_vinculos for insert to authenticated
  with check ((select auth.uid()) is not null and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

drop policy if exists "Administrador atualiza vínculos" on public.usuarios_vinculos;
create policy "Administrador atualiza vínculos"
  on public.usuarios_vinculos for update to authenticated
  using ((select auth.uid()) is not null and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check ((select auth.uid()) is not null and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

drop policy if exists "Administrador remove vínculos" on public.usuarios_vinculos;
create policy "Administrador remove vínculos"
  on public.usuarios_vinculos for delete to authenticated
  using ((select auth.uid()) is not null and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

revoke all on public.usuarios_vinculos from anon, authenticated;
grant select, insert, update, delete on public.usuarios_vinculos to authenticated;
grant all on public.usuarios_vinculos to service_role;

do $$
begin
  if to_regprocedure('private.registrar_auditoria_erp()') is not null then
    drop trigger if exists registrar_auditoria_erp on public.usuarios_vinculos;
    create trigger registrar_auditoria_erp
    after insert or update or delete on public.usuarios_vinculos
    for each row execute function private.registrar_auditoria_erp();
  end if;
end;
$$;
