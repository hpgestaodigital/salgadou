-- Jurídico e vínculos de usuários passam a obedecer à matriz configurável.

do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'contratos',
        'contrato_validacoes',
        'contrato_signatarios',
        'contrato_lembretes',
        'documentos_juridicos',
        'demandas_juridicas',
        'usuarios_vinculos'
      )
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

create policy "Jurídico gerencia contratos"
on public.contratos
for all
to authenticated
using (private.usuario_pode_acessar('juridico'))
with check (private.usuario_pode_acessar('juridico'));

create policy "Jurídico gerencia validações"
on public.contrato_validacoes
for all
to authenticated
using (private.usuario_pode_acessar('juridico'))
with check (private.usuario_pode_acessar('juridico'));

create policy "Jurídico gerencia signatários"
on public.contrato_signatarios
for all
to authenticated
using (private.usuario_pode_acessar('juridico'))
with check (private.usuario_pode_acessar('juridico'));

create policy "Jurídico consulta lembretes"
on public.contrato_lembretes
for select
to authenticated
using (private.usuario_pode_acessar('juridico'));

create policy "Jurídico gerencia documentos"
on public.documentos_juridicos
for all
to authenticated
using (private.usuario_pode_acessar('juridico'))
with check (private.usuario_pode_acessar('juridico'));

create policy "Jurídico consulta demandas"
on public.demandas_juridicas
for select
to authenticated
using (private.usuario_pode_acessar('juridico'));

create policy "Jurídico cria demandas"
on public.demandas_juridicas
for insert
to authenticated
with check (
  private.usuario_pode_acessar('juridico')
  and solicitante_id = (select auth.uid())
);

create policy "Jurídico atualiza demandas"
on public.demandas_juridicas
for update
to authenticated
using (private.usuario_pode_acessar('juridico'))
with check (private.usuario_pode_acessar('juridico'));

create policy "Jurídico exclui demandas"
on public.demandas_juridicas
for delete
to authenticated
using (private.usuario_pode_acessar('juridico'));

create policy "Usuário consulta vínculo próprio"
on public.usuarios_vinculos
for select
to authenticated
using (
  usuario_id = (select auth.uid())
  or private.usuario_pode_acessar('usuarios')
);

create policy "Usuários autorizados criam vínculos"
on public.usuarios_vinculos
for insert
to authenticated
with check (private.usuario_pode_acessar('usuarios'));

create policy "Usuários autorizados atualizam vínculos"
on public.usuarios_vinculos
for update
to authenticated
using (private.usuario_pode_acessar('usuarios'))
with check (private.usuario_pode_acessar('usuarios'));

create policy "Usuários autorizados removem vínculos"
on public.usuarios_vinculos
for delete
to authenticated
using (private.usuario_pode_acessar('usuarios'));

create index if not exists escala_colaborador_idx
  on public.escala (colaborador_id);

create index if not exists kanban_tarefas_responsavel_idx
  on public.kanban_tarefas (responsavel_id);

create index if not exists pagamentos_motoboys_motoboy_idx
  on public.pagamentos_motoboys (motoboy_id)
  where motoboy_id is not null;
