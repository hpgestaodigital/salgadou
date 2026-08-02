-- Papel Financeiro com o mesmo alcance funcional das políticas administrativas atuais.
-- A autorização permanece em app_metadata e exige uma nova sessão após a troca do papel.

alter table public.perfis_permissoes
  drop constraint if exists perfis_permissoes_papel_check;

alter table public.perfis_permissoes
  add constraint perfis_permissoes_papel_check
  check (papel in ('admin', 'financeiro', 'socio', 'juridico', 'colaborador'));

insert into public.perfis_permissoes (papel, modulo, pode_visualizar)
select 'financeiro', modulo, true
from (
  select distinct modulo from public.perfis_permissoes
  union
  values ('financeiro')
) as modulos(modulo)
on conflict (papel, modulo) do update
set pode_visualizar = true;

-- Replica, para o novo papel, cada política vigente que hoje autoriza admin.
-- As condições adicionais de cada política (pasta, proprietário e tipo de ação)
-- são preservadas; apenas o valor do papel é substituído.
do $$
declare
  politica record;
  nome_politica text;
  expressao_using text;
  expressao_check text;
  comando text;
begin
  for politica in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and 'authenticated' = any (roles)
      and (
        coalesce(qual, '') like '%app_metadata%admin%'
        or coalesce(with_check, '') like '%app_metadata%admin%'
      )
      and policyname not like 'Financeiro acesso %'
  loop
    nome_politica := 'Financeiro acesso ' || md5(politica.schemaname || '.' || politica.tablename || '.' || politica.policyname);
    expressao_using := replace(politica.qual, '''admin''::text', '''financeiro''::text');
    expressao_check := replace(politica.with_check, '''admin''::text', '''financeiro''::text');
    comando := lower(politica.cmd);

    execute format('drop policy if exists %I on %I.%I', nome_politica, politica.schemaname, politica.tablename);

    if politica.cmd = 'INSERT' then
      execute format(
        'create policy %I on %I.%I for insert to authenticated with check (%s)',
        nome_politica, politica.schemaname, politica.tablename, expressao_check
      );
    elsif politica.cmd = 'SELECT' or politica.cmd = 'DELETE' then
      execute format(
        'create policy %I on %I.%I for %s to authenticated using (%s)',
        nome_politica, politica.schemaname, politica.tablename, comando, expressao_using
      );
    else
      execute format(
        'create policy %I on %I.%I for %s to authenticated using (%s) with check (%s)',
        nome_politica, politica.schemaname, politica.tablename, comando,
        expressao_using, coalesce(expressao_check, expressao_using)
      );
    end if;
  end loop;
end $$;

grant select on public.perfis_permissoes to authenticated, service_role;
