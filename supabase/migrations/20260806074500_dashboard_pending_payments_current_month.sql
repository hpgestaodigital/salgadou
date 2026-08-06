create or replace function public.resumo_dashboard_v1(semana_inicio_param date)
returns table(
  producao_planejada bigint,
  producao_em_andamento bigint,
  reunioes_semana bigint,
  pessoas_na_escala bigint,
  fornecedores_pendentes bigint,
  fornecedores_valor numeric,
  motoboys_pendentes bigint,
  motoboys_valor numeric,
  demandas_juridicas bigint,
  contratos_pendentes bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    case when private.usuario_pode_acessar('producao_planejamento') then (
      select count(*) from public.producao_planejamento p
      where p.data_producao between semana_inicio_param and semana_inicio_param + 6
        and p.status = 'planejado'
    ) else 0 end,
    case when private.usuario_pode_acessar('producao_planejamento') then (
      select count(*) from public.producao_planejamento p
      where p.data_producao between semana_inicio_param and semana_inicio_param + 6
        and p.status = 'em_producao'
    ) else 0 end,
    case when private.usuario_pode_acessar('dashboard_calendario_producao') then (
      select count(*) from public.listar_agenda_reunioes_dashboard(semana_inicio_param, semana_inicio_param + 6)
    ) else 0 end,
    case when private.usuario_pode_acessar('dashboard_calendario_producao') then (
      select count(*) from public.listar_escala_dashboard(semana_inicio_param)
      where coalesce(seg, ter, qua, qui, sex, sab, dom) is not null
    ) else 0 end,
    case when private.usuario_pode_acessar('dashboard_fornecedores') then (
      select count(*) from public.pagamentos_fornecedores
      where pago_em is null
        and vencimento >= date_trunc('month', current_date)::date
        and vencimento < (date_trunc('month', current_date) + interval '1 month')::date
    ) else 0 end,
    case when private.usuario_pode_acessar('dashboard_fornecedores') then (
      select coalesce(sum(valor), 0) from public.pagamentos_fornecedores
      where pago_em is null
        and vencimento >= date_trunc('month', current_date)::date
        and vencimento < (date_trunc('month', current_date) + interval '1 month')::date
    ) else 0 end,
    case when private.usuario_pode_acessar('dashboard_motoboys') then (
      select count(*) from public.pagamentos_motoboys
      where pago_em is null
        and data >= date_trunc('month', current_date)::date
        and data < (date_trunc('month', current_date) + interval '1 month')::date
    ) else 0 end,
    case when private.usuario_pode_acessar('dashboard_motoboys') then (
      select coalesce(sum(total), 0) from public.pagamentos_motoboys
      where pago_em is null
        and data >= date_trunc('month', current_date)::date
        and data < (date_trunc('month', current_date) + interval '1 month')::date
    ) else 0 end,
    case when private.usuario_pode_acessar('juridico') then (
      select count(*) from public.demandas_juridicas where status <> 'concluido'
    ) else 0 end,
    case when private.usuario_pode_acessar('juridico') then (
      select count(*) from public.contratos where status not in ('assinado', 'arquivado')
    ) else 0 end
  where auth.uid() is not null
    and private.usuario_pode_acessar('dashboard');
$$;

notify pgrst, 'reload schema';
