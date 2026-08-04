-- Esta migration deve entrar junto do frontend que remove os acessos obrigatórios.

-- Remove blocos antigos que deixaram de existir na Dashboard v1.
delete from public.usuarios_permissoes
where modulo in (
  'dashboard_equipe_ativa',
  'dashboard_pendencias_colaboradores',
  'dashboard_pendencias_socios'
);

delete from public.perfis_permissoes
where modulo in (
  'dashboard_equipe_ativa',
  'dashboard_pendencias_colaboradores',
  'dashboard_pendencias_socios'
);

-- A Dashboard passa a ser o painel de acompanhamento dos perfis operacionais.
insert into public.perfis_permissoes (papel, modulo, pode_visualizar)
values
  ('colaborador', 'dashboard', true),
  ('colaborador', 'dashboard_calendario_producao', true),
  ('juridico', 'dashboard', true),
  ('juridico', 'dashboard_calendario_producao', true)
on conflict (papel, modulo)
do update set pode_visualizar = excluded.pode_visualizar;

-- Escala e Kanban são áreas de gestão exclusivas de administrador e sócios.
insert into public.perfis_permissoes (papel, modulo, pode_visualizar)
values
  ('colaborador', 'escala', false),
  ('colaborador', 'kanban', false),
  ('financeiro', 'escala', false),
  ('financeiro', 'kanban', false),
  ('juridico', 'escala', false),
  ('juridico', 'kanban', false),
  ('admin', 'escala', true),
  ('admin', 'kanban', true),
  ('socio', 'escala', true),
  ('socio', 'kanban', true)
on conflict (papel, modulo)
do update set pode_visualizar = excluded.pode_visualizar;

-- Remove liberações individuais antigas que eram forçadas automaticamente.
insert into public.usuarios_permissoes (usuario_id, modulo, pode_visualizar, updated_at)
select
  u.id,
  modulo.modulo,
  false,
  now()
from auth.users u
cross join (values ('escala'::text), ('kanban'::text)) as modulo(modulo)
where coalesce(u.raw_app_meta_data ->> 'role', 'colaborador') not in ('admin', 'socio')
on conflict (usuario_id, modulo)
do update set
  pode_visualizar = false,
  updated_at = excluded.updated_at;

-- Reforça no banco que somente administrador e sócios podem consultar e editar a Escala.
drop policy if exists "Usuários autorizados consultam escala" on public.escala;
drop policy if exists "Gestores inserem escala" on public.escala;
drop policy if exists "Gestores atualizam escala" on public.escala;
drop policy if exists "Gestores excluem escala" on public.escala;

create policy "Admin e sócios consultam escala"
on public.escala
for select
to authenticated
using (
  private.usuario_pode_acessar('escala')
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio')
);

create policy "Admin e sócios inserem escala"
on public.escala
for insert
to authenticated
with check (
  private.usuario_pode_acessar('escala')
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio')
);

create policy "Admin e sócios atualizam escala"
on public.escala
for update
to authenticated
using (
  private.usuario_pode_acessar('escala')
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio')
)
with check (
  private.usuario_pode_acessar('escala')
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio')
);

create policy "Admin e sócios excluem escala"
on public.escala
for delete
to authenticated
using (
  private.usuario_pode_acessar('escala')
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio')
);

-- O Kanban continua sendo alimentado por integrações internas, mas sua gestão direta é exclusiva.
drop policy if exists "Autorizados gerenciam Kanban" on public.kanban_tarefas;

create policy "Admin e sócios gerenciam Kanban"
on public.kanban_tarefas
for all
to authenticated
using (
  private.usuario_pode_acessar('kanban')
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio')
)
with check (
  private.usuario_pode_acessar('kanban')
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'socio')
);
