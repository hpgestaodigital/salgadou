-- Personalização individual dos blocos exibidos no Dashboard.

insert into public.perfis_permissoes (papel, modulo, pode_visualizar, updated_at)
values
  ('admin', 'dashboard_calendario_producao', true, now()),
  ('admin', 'dashboard_resumo_financeiro', true, now()),
  ('admin', 'dashboard_equipe_ativa', true, now()),
  ('admin', 'dashboard_pendencias', true, now()),
  ('financeiro', 'dashboard_calendario_producao', true, now()),
  ('financeiro', 'dashboard_resumo_financeiro', true, now()),
  ('financeiro', 'dashboard_equipe_ativa', true, now()),
  ('financeiro', 'dashboard_pendencias', true, now()),
  ('socio', 'dashboard_calendario_producao', true, now()),
  ('socio', 'dashboard_resumo_financeiro', true, now()),
  ('socio', 'dashboard_equipe_ativa', true, now()),
  ('socio', 'dashboard_pendencias', true, now()),
  ('colaborador', 'dashboard_calendario_producao', true, now()),
  ('colaborador', 'dashboard_resumo_financeiro', false, now()),
  ('colaborador', 'dashboard_equipe_ativa', true, now()),
  ('colaborador', 'dashboard_pendencias', true, now()),
  ('juridico', 'dashboard_calendario_producao', false, now()),
  ('juridico', 'dashboard_resumo_financeiro', false, now()),
  ('juridico', 'dashboard_equipe_ativa', false, now()),
  ('juridico', 'dashboard_pendencias', false, now())
on conflict (papel, modulo) do update
set pode_visualizar = excluded.pode_visualizar, updated_at = now();

-- O calendário é parte do acesso mínimo de todo colaborador.
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
        and modulo_consultado in ('dashboard', 'dashboard_calendario_producao', 'escala', 'kanban')
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

-- A leitura do calendário obedece ao bloco individual do Dashboard;
-- a edição continua exclusiva da equipe autorizada na Produção.
drop policy if exists "Permissão de módulo producao_produtos" on public.producao_produtos;
drop policy if exists "Dashboard consulta produtos da produção" on public.producao_produtos;
drop policy if exists "Produção gerencia produtos" on public.producao_produtos;

create policy "Dashboard consulta produtos da produção"
  on public.producao_produtos for select to authenticated
  using (
    private.usuario_pode_acessar('dashboard_calendario_producao')
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
    private.usuario_pode_acessar('dashboard_calendario_producao')
    or private.usuario_pode_acessar('producao_planejamento')
  );

create policy "Produção gerencia planejamento"
  on public.producao_planejamento for all to authenticated
  using (private.usuario_pode_acessar('producao_planejamento'))
  with check (private.usuario_pode_acessar('producao_planejamento'));

grant select on public.producao_produtos, public.producao_planejamento to authenticated, service_role;
