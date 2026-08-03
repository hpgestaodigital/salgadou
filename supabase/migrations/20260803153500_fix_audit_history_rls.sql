-- O histórico de auditoria só pode ser consultado por usuários com o módulo Histórico liberado.

drop policy if exists "Financeiro acesso 00dc13668b28be22fca05f7941040d19"
  on public.auditoria_acoes;

drop policy if exists "Pessoas autorizadas consultam auditoria"
  on public.auditoria_acoes;

create policy "Usuários autorizados consultam auditoria"
on public.auditoria_acoes
for select
to authenticated
using (
  (select auth.uid()) is not null
  and private.usuario_pode_acessar('historico')
);
