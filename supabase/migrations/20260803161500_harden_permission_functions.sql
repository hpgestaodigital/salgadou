-- Restringe funções internas e faz a gestão de permissões obedecer ao módulo Usuários.

-- O código de lote é um helper interno chamado pelas RPCs da Produção.
revoke all on function public.gerar_codigo_lote(date, uuid) from public;
revoke execute on function public.gerar_codigo_lote(date, uuid) from authenticated;

-- Lançamentos de metas devem obedecer à permissão configurável do módulo.
create or replace function public.registrar_lancamento_meta(
  p_meta_id uuid,
  p_valor numeric,
  p_data_lancamento date default current_date
)
returns public.meta_lancamentos
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_total numeric;
  v_lancamento public.meta_lancamentos;
begin
  if v_usuario_id is null or not private.usuario_pode_acessar('metas') then
    raise exception 'Acesso negado';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor lançado deve ser maior que zero';
  end if;

  if p_data_lancamento is null then
    raise exception 'A data do lançamento é obrigatória';
  end if;

  select valor_atual
    into v_total
  from public.metas
  where id = p_meta_id
  for update;

  if not found then
    raise exception 'Meta não encontrada';
  end if;

  v_total := coalesce(v_total, 0) + p_valor;

  update public.metas
  set valor_atual = v_total,
      updated_at = now()
  where id = p_meta_id;

  insert into public.meta_lancamentos (
    meta_id,
    data_lancamento,
    valor_lancado,
    total_acumulado,
    criado_por
  ) values (
    p_meta_id,
    p_data_lancamento,
    p_valor,
    v_total,
    v_usuario_id
  )
  returning * into v_lancamento;

  return v_lancamento;
end;
$$;

revoke all on function public.registrar_lancamento_meta(uuid, numeric, date) from public;
grant execute on function public.registrar_lancamento_meta(uuid, numeric, date) to authenticated;

-- Remove políticas antigas que concediam gestão de permissões por nome do papel.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('perfis_permissoes', 'usuarios_permissoes')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  end loop;
end;
$$;

-- Todos os usuários autenticados precisam ler o padrão do próprio perfil para montar o menu.
create policy "Autenticados consultam permissões padrão"
on public.perfis_permissoes
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Usuários autorizados inserem permissões padrão"
on public.perfis_permissoes
for insert
to authenticated
with check (private.usuario_pode_acessar('usuarios'));

create policy "Usuários autorizados atualizam permissões padrão"
on public.perfis_permissoes
for update
to authenticated
using (private.usuario_pode_acessar('usuarios'))
with check (private.usuario_pode_acessar('usuarios'));

create policy "Usuários autorizados excluem permissões padrão"
on public.perfis_permissoes
for delete
to authenticated
using (private.usuario_pode_acessar('usuarios'));

-- Cada pessoa lê seus próprios ajustes; quem administra Usuários lê e gerencia todos.
create policy "Usuário consulta permissões próprias"
on public.usuarios_permissoes
for select
to authenticated
using (
  usuario_id = (select auth.uid())
  or private.usuario_pode_acessar('usuarios')
);

create policy "Usuários autorizados inserem permissões individuais"
on public.usuarios_permissoes
for insert
to authenticated
with check (private.usuario_pode_acessar('usuarios'));

create policy "Usuários autorizados atualizam permissões individuais"
on public.usuarios_permissoes
for update
to authenticated
using (private.usuario_pode_acessar('usuarios'))
with check (private.usuario_pode_acessar('usuarios'));

create policy "Usuários autorizados excluem permissões individuais"
on public.usuarios_permissoes
for delete
to authenticated
using (private.usuario_pode_acessar('usuarios'));
