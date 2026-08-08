create or replace function public.resumo_vencidos_anteriores_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select jsonb_build_object(
    'fornecedores',
    case when private.usuario_pode_acessar('dashboard_fornecedores') then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'mes', agrupado.mes,
          'valor', agrupado.valor,
          'quantidade', agrupado.quantidade
        ) order by agrupado.mes desc
      )
      from (
        select
          to_char(date_trunc('month', vencimento), 'YYYY-MM') as mes,
          coalesce(sum(valor), 0) as valor,
          count(*) as quantidade
        from public.pagamentos_fornecedores
        where pago_em is null
          and vencimento < date_trunc('month', current_date)::date
        group by date_trunc('month', vencimento)
      ) agrupado
    ), '[]'::jsonb) else '[]'::jsonb end,
    'motoboys',
    case when private.usuario_pode_acessar('dashboard_motoboys') then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'mes', agrupado.mes,
          'valor', agrupado.valor,
          'quantidade', agrupado.quantidade
        ) order by agrupado.mes desc
      )
      from (
        select
          to_char(date_trunc('month', data), 'YYYY-MM') as mes,
          coalesce(sum(total), 0) as valor,
          count(*) as quantidade
        from public.pagamentos_motoboys
        where pago_em is null
          and data < date_trunc('month', current_date)::date
        group by date_trunc('month', data)
      ) agrupado
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  where auth.uid() is not null
    and private.usuario_pode_acessar('dashboard');
$$;

grant execute on function public.resumo_vencidos_anteriores_dashboard() to authenticated;

notify pgrst, 'reload schema';
