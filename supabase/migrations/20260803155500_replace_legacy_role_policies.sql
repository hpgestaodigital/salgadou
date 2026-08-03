-- Remove políticas antigas baseadas apenas no papel do JWT e aplica as permissões
-- configuráveis dos módulos do ERP.

do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'colaboradores',
        'configuracoes',
        'entregas_motoboy',
        'fornecedores',
        'kanban_tarefas',
        'motoboys',
        'notificacoes_log',
        'pagamentos_fornecedores',
        'pagamentos_motoboys',
        'reunioes',
        'reunioes_itens'
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

-- Colaboradores são consultados por vários fluxos operacionais, mas somente o
-- módulo Cadastros pode criar, editar ou remover pessoas.
create policy "Módulos operacionais consultam colaboradores"
on public.colaboradores
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    private.usuario_pode_acessar('cadastros')
    or private.usuario_pode_acessar('dashboard')
    or private.usuario_pode_acessar('escala')
    or private.usuario_pode_acessar('kanban')
    or private.usuario_pode_acessar('reunioes')
    or private.usuario_pode_acessar('juridico')
    or private.usuario_pode_acessar('usuarios')
    or private.usuario_pode_acessar('producao_planejamento')
    or private.usuario_pode_acessar('pagamentos_fornecedores')
    or private.usuario_pode_acessar('pagamentos_motoboys')
  )
);

create policy "Cadastros insere colaboradores"
on public.colaboradores
for insert
to authenticated
with check (private.usuario_pode_acessar('cadastros'));

create policy "Cadastros atualiza colaboradores"
on public.colaboradores
for update
to authenticated
using (private.usuario_pode_acessar('cadastros'))
with check (private.usuario_pode_acessar('cadastros'));

create policy "Cadastros exclui colaboradores"
on public.colaboradores
for delete
to authenticated
using (private.usuario_pode_acessar('cadastros'));

-- As configurações de exibição e marca são necessárias ao aplicativo inteiro.
-- Alterações continuam restritas ao módulo Configurações.
create policy "Autenticados consultam configurações"
on public.configuracoes
for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Configurações insere registros"
on public.configuracoes
for insert
to authenticated
with check (private.usuario_pode_acessar('configuracoes'));

create policy "Configurações atualiza registros"
on public.configuracoes
for update
to authenticated
using (private.usuario_pode_acessar('configuracoes'))
with check (private.usuario_pode_acessar('configuracoes'));

create policy "Configurações exclui registros"
on public.configuracoes
for delete
to authenticated
using (private.usuario_pode_acessar('configuracoes'));

-- Fornecedores podem ser consultados por Cadastros, pagamentos e Mercado.
create policy "Módulos autorizados consultam fornecedores"
on public.fornecedores
for select
to authenticated
using (
  private.usuario_pode_acessar('cadastros')
  or private.usuario_pode_acessar('pagamentos_fornecedores')
  or private.usuario_pode_acessar('producao_compras')
  or private.usuario_pode_acessar('dashboard_fornecedores')
);

create policy "Cadastros insere fornecedores"
on public.fornecedores
for insert
to authenticated
with check (private.usuario_pode_acessar('cadastros'));

create policy "Cadastros atualiza fornecedores"
on public.fornecedores
for update
to authenticated
using (private.usuario_pode_acessar('cadastros'))
with check (private.usuario_pode_acessar('cadastros'));

create policy "Cadastros exclui fornecedores"
on public.fornecedores
for delete
to authenticated
using (private.usuario_pode_acessar('cadastros'));

-- Motoboys são consultados por Cadastros, Dashboard e pagamentos.
create policy "Módulos autorizados consultam motoboys"
on public.motoboys
for select
to authenticated
using (
  private.usuario_pode_acessar('cadastros')
  or private.usuario_pode_acessar('pagamentos_motoboys')
  or private.usuario_pode_acessar('dashboard_motoboys')
  or private.usuario_pode_acessar('dashboard')
);

create policy "Cadastros insere motoboys"
on public.motoboys
for insert
to authenticated
with check (private.usuario_pode_acessar('cadastros'));

create policy "Cadastros atualiza motoboys"
on public.motoboys
for update
to authenticated
using (private.usuario_pode_acessar('cadastros'))
with check (private.usuario_pode_acessar('cadastros'));

create policy "Cadastros exclui motoboys"
on public.motoboys
for delete
to authenticated
using (private.usuario_pode_acessar('cadastros'));

-- Pagamentos e entregas obedecem aos módulos financeiros correspondentes.
create policy "Autorizados consultam pagamentos de fornecedores"
on public.pagamentos_fornecedores
for select
to authenticated
using (
  private.usuario_pode_acessar('pagamentos_fornecedores')
  or private.usuario_pode_acessar('dashboard_fornecedores')
);

create policy "Autorizados inserem pagamentos de fornecedores"
on public.pagamentos_fornecedores
for insert
to authenticated
with check (private.usuario_pode_acessar('pagamentos_fornecedores'));

create policy "Autorizados atualizam pagamentos de fornecedores"
on public.pagamentos_fornecedores
for update
to authenticated
using (private.usuario_pode_acessar('pagamentos_fornecedores'))
with check (private.usuario_pode_acessar('pagamentos_fornecedores'));

create policy "Autorizados excluem pagamentos de fornecedores"
on public.pagamentos_fornecedores
for delete
to authenticated
using (private.usuario_pode_acessar('pagamentos_fornecedores'));

create policy "Autorizados consultam pagamentos de motoboys"
on public.pagamentos_motoboys
for select
to authenticated
using (
  private.usuario_pode_acessar('pagamentos_motoboys')
  or private.usuario_pode_acessar('dashboard_motoboys')
);

create policy "Autorizados inserem pagamentos de motoboys"
on public.pagamentos_motoboys
for insert
to authenticated
with check (private.usuario_pode_acessar('pagamentos_motoboys'));

create policy "Autorizados atualizam pagamentos de motoboys"
on public.pagamentos_motoboys
for update
to authenticated
using (private.usuario_pode_acessar('pagamentos_motoboys'))
with check (private.usuario_pode_acessar('pagamentos_motoboys'));

create policy "Autorizados excluem pagamentos de motoboys"
on public.pagamentos_motoboys
for delete
to authenticated
using (private.usuario_pode_acessar('pagamentos_motoboys'));

create policy "Autorizados gerenciam entregas de motoboy"
on public.entregas_motoboy
for all
to authenticated
using (private.usuario_pode_acessar('pagamentos_motoboys'))
with check (private.usuario_pode_acessar('pagamentos_motoboys'));

-- Kanban e Reuniões deixam de depender do nome do papel do usuário.
create policy "Autorizados gerenciam Kanban"
on public.kanban_tarefas
for all
to authenticated
using (private.usuario_pode_acessar('kanban'))
with check (private.usuario_pode_acessar('kanban'));

create policy "Autorizados gerenciam reuniões"
on public.reunioes
for all
to authenticated
using (private.usuario_pode_acessar('reunioes'))
with check (private.usuario_pode_acessar('reunioes'));

create policy "Autorizados gerenciam itens de reunião"
on public.reunioes_itens
for all
to authenticated
using (private.usuario_pode_acessar('reunioes'))
with check (private.usuario_pode_acessar('reunioes'));

-- Logs de notificações contêm números e erros operacionais.
create policy "Configurações consulta logs de notificações"
on public.notificacoes_log
for select
to authenticated
using (private.usuario_pode_acessar('configuracoes'));
