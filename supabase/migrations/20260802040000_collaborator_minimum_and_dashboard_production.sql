-- Acesso mínimo dos colaboradores e calendário de produção somente para leitura no Dashboard.

update public.perfis_permissoes
set pode_visualizar = false, updated_at = now()
where papel = 'colaborador';

insert into public.perfis_permissoes (papel, modulo, pode_visualizar, updated_at)
values
  ('colaborador', 'dashboard', true, now()),
  ('colaborador', 'escala', true, now()),
  ('colaborador', 'kanban', true, now())
on conflict (papel, modulo) do update
set pode_visualizar = true, updated_at = now();

-- O acesso mínimo não pode ser retirado por uma personalização individual.
create or replace function private.usuario_pode_acessar(modulo_consultado text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select (select auth.uid()) is not null
    and (
      (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'colaborador'
        and modulo_consultado in ('dashboard', 'escala', 'kanban')
      )
      or coalesce(
        (
          select up.pode_visualizar
          from public.usuarios_permissoes up
          where up.usuario_id = (select auth.uid())
            and up.modulo = modulo_consultado
        ),
        (
          select pp.pode_visualizar
          from public.perfis_permissoes pp
          where pp.papel = coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
            and pp.modulo = modulo_consultado
        ),
        false
      )
    );
$$;

revoke all on function private.usuario_pode_acessar(text) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.usuario_pode_acessar(text) to authenticated, service_role;

-- Produtos e planejamento podem ser consultados no Dashboard por quem possui
-- acesso ao Dashboard. Somente usuários autorizados na Produção podem alterar.
drop policy if exists "Permissão de módulo producao_produtos" on public.producao_produtos;
drop policy if exists "Dashboard consulta produtos da produção" on public.producao_produtos;
drop policy if exists "Produção gerencia produtos" on public.producao_produtos;

create policy "Dashboard consulta produtos da produção"
  on public.producao_produtos for select to authenticated
  using (
    private.usuario_pode_acessar('dashboard')
    or private.usuario_pode_acessar('producao_planejamento')
  );

create policy "Produção gerencia produtos"
  on public.producao_produtos for all to authenticated
  using (private.usuario_pode_acessar('producao_planejamento'))
  with check (private.usuario_pode_acessar('producao_planejamento'));

drop policy if exists "Permissão de módulo producao_planejamento" on public.producao_planejamento;
drop policy if exists "Dashboard consulta calendário da produção" on public.producao_planejamento;
drop policy if exists "Produção gerencia planejamento" on public.producao_planejamento;

create policy "Dashboard consulta calendário da produção"
  on public.producao_planejamento for select to authenticated
  using (
    private.usuario_pode_acessar('dashboard')
    or private.usuario_pode_acessar('producao_planejamento')
  );

create policy "Produção gerencia planejamento"
  on public.producao_planejamento for all to authenticated
  using (private.usuario_pode_acessar('producao_planejamento'))
  with check (private.usuario_pode_acessar('producao_planejamento'));

grant select on public.producao_produtos, public.producao_planejamento to authenticated, service_role;
