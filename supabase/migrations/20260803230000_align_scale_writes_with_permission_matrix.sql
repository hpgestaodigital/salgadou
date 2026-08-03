drop policy if exists "Gestores inserem escala" on public.escala;
drop policy if exists "Gestores atualizam escala" on public.escala;
drop policy if exists "Gestores excluem escala" on public.escala;

create policy "Gestores inserem escala"
on public.escala for insert to authenticated
with check (
  private.usuario_pode_acessar('escala')
  and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '')
    = any (array['admin','financeiro','socio'])
);

create policy "Gestores atualizam escala"
on public.escala for update to authenticated
using (
  private.usuario_pode_acessar('escala')
  and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '')
    = any (array['admin','financeiro','socio'])
)
with check (
  private.usuario_pode_acessar('escala')
  and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '')
    = any (array['admin','financeiro','socio'])
);

create policy "Gestores excluem escala"
on public.escala for delete to authenticated
using (
  private.usuario_pode_acessar('escala')
  and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '')
    = any (array['admin','financeiro','socio'])
);
