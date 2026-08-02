-- Separa os controles agrupados do Dashboard em blocos individuais.

insert into public.perfis_permissoes (papel, modulo, pode_visualizar, updated_at)
select papel, novo_modulo, pode_visualizar, now()
from public.perfis_permissoes
cross join lateral (
  values
    (case when modulo = 'dashboard_resumo_financeiro' then 'dashboard_fornecedores' end),
    (case when modulo = 'dashboard_resumo_financeiro' then 'dashboard_motoboys' end),
    (case when modulo = 'dashboard_pendencias' then 'dashboard_pendencias_colaboradores' end),
    (case when modulo = 'dashboard_pendencias' then 'dashboard_pendencias_socios' end)
) as novos(novo_modulo)
where modulo in ('dashboard_resumo_financeiro', 'dashboard_pendencias')
  and novo_modulo is not null
on conflict (papel, modulo) do nothing;

-- Caso a migração agrupada ainda não tenha sido executada, aplica padrões seguros.
insert into public.perfis_permissoes (papel, modulo, pode_visualizar, updated_at)
values
  ('admin', 'dashboard_fornecedores', true, now()),
  ('admin', 'dashboard_motoboys', true, now()),
  ('admin', 'dashboard_pendencias_colaboradores', true, now()),
  ('admin', 'dashboard_pendencias_socios', true, now()),
  ('financeiro', 'dashboard_fornecedores', true, now()),
  ('financeiro', 'dashboard_motoboys', true, now()),
  ('financeiro', 'dashboard_pendencias_colaboradores', true, now()),
  ('financeiro', 'dashboard_pendencias_socios', true, now()),
  ('socio', 'dashboard_fornecedores', true, now()),
  ('socio', 'dashboard_motoboys', true, now()),
  ('socio', 'dashboard_pendencias_colaboradores', true, now()),
  ('socio', 'dashboard_pendencias_socios', true, now()),
  ('colaborador', 'dashboard_fornecedores', false, now()),
  ('colaborador', 'dashboard_motoboys', false, now()),
  ('colaborador', 'dashboard_pendencias_colaboradores', true, now()),
  ('colaborador', 'dashboard_pendencias_socios', true, now()),
  ('juridico', 'dashboard_fornecedores', false, now()),
  ('juridico', 'dashboard_motoboys', false, now()),
  ('juridico', 'dashboard_pendencias_colaboradores', false, now()),
  ('juridico', 'dashboard_pendencias_socios', false, now())
on conflict (papel, modulo) do nothing;

-- Preserva personalizações individuais feitas nos controles antigos.
insert into public.usuarios_permissoes (usuario_id, modulo, pode_visualizar, updated_at)
select usuario_id, novo_modulo, pode_visualizar, now()
from public.usuarios_permissoes
cross join lateral (
  values
    (case when modulo = 'dashboard_resumo_financeiro' then 'dashboard_fornecedores' end),
    (case when modulo = 'dashboard_resumo_financeiro' then 'dashboard_motoboys' end),
    (case when modulo = 'dashboard_pendencias' then 'dashboard_pendencias_colaboradores' end),
    (case when modulo = 'dashboard_pendencias' then 'dashboard_pendencias_socios' end)
) as novos(novo_modulo)
where modulo in ('dashboard_resumo_financeiro', 'dashboard_pendencias')
  and novo_modulo is not null
on conflict (usuario_id, modulo) do nothing;
