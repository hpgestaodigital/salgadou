-- Remove avaliações duplicadas de SELECT sem ampliar ou reduzir permissões.

-- Escala: preserva a regra de escrita apenas para admin, financeiro e sócio,
-- calculando o JWT uma única vez por consulta.
drop policy if exists "Gestores inserem escala" on public.escala;
drop policy if exists "Gestores atualizam escala" on public.escala;
drop policy if exists "Gestores excluem escala" on public.escala;

create policy "Gestores inserem escala"
on public.escala for insert to authenticated
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '')
    = any (array['admin','financeiro','socio'])
);

create policy "Gestores atualizam escala"
on public.escala for update to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '')
    = any (array['admin','financeiro','socio'])
)
with check (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '')
    = any (array['admin','financeiro','socio'])
);

create policy "Gestores excluem escala"
on public.escala for delete to authenticated
using (
  coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '')
    = any (array['admin','financeiro','socio'])
);

-- Consumos: mantém a leitura para Produção ou calendário da Dashboard,
-- e escrita apenas para Planejamento.
drop policy if exists "Produção gerencia consumos" on public.producao_consumos;
create policy "Produção insere consumos"
on public.producao_consumos for insert to authenticated
with check (private.usuario_pode_acessar('producao_planejamento'));
create policy "Produção atualiza consumos"
on public.producao_consumos for update to authenticated
using (private.usuario_pode_acessar('producao_planejamento'))
with check (private.usuario_pode_acessar('producao_planejamento'));
create policy "Produção exclui consumos"
on public.producao_consumos for delete to authenticated
using (private.usuario_pode_acessar('producao_planejamento'));

-- Lotes: mantém leitura para Estoque ou Planejamento e escrita para Planejamento.
drop policy if exists producao_lotes_write on public.producao_lotes;
create policy "Produção insere lotes"
on public.producao_lotes for insert to authenticated
with check (private.usuario_pode_acessar('producao_planejamento'));
create policy "Produção atualiza lotes"
on public.producao_lotes for update to authenticated
using (private.usuario_pode_acessar('producao_planejamento'))
with check (private.usuario_pode_acessar('producao_planejamento'));
create policy "Produção exclui lotes"
on public.producao_lotes for delete to authenticated
using (private.usuario_pode_acessar('producao_planejamento'));

-- Planejamento: preserva leitura pela Dashboard e escrita pelo módulo de Planejamento.
drop policy if exists "Produção gerencia planejamento" on public.producao_planejamento;
create policy "Produção insere planejamento"
on public.producao_planejamento for insert to authenticated
with check (private.usuario_pode_acessar('producao_planejamento'));
create policy "Produção atualiza planejamento"
on public.producao_planejamento for update to authenticated
using (private.usuario_pode_acessar('producao_planejamento'))
with check (private.usuario_pode_acessar('producao_planejamento'));
create policy "Produção exclui planejamento"
on public.producao_planejamento for delete to authenticated
using (private.usuario_pode_acessar('producao_planejamento'));

-- Produtos: preserva leitura pela Dashboard e escrita pelo Planejamento.
drop policy if exists "Produção gerencia produtos" on public.producao_produtos;
create policy "Produção insere produtos"
on public.producao_produtos for insert to authenticated
with check (private.usuario_pode_acessar('producao_planejamento'));
create policy "Produção atualiza produtos"
on public.producao_produtos for update to authenticated
using (private.usuario_pode_acessar('producao_planejamento'))
with check (private.usuario_pode_acessar('producao_planejamento'));
create policy "Produção exclui produtos"
on public.producao_produtos for delete to authenticated
using (private.usuario_pode_acessar('producao_planejamento'));

notify pgrst, 'reload schema';
