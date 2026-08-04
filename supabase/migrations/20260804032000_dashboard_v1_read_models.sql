create or replace function public.listar_escala_dashboard(semana_inicio_param date)
returns table (
  colaborador_id uuid,
  nome text,
  funcao text,
  semana_inicio date,
  seg text,
  ter text,
  qua text,
  qui text,
  sex text,
  sab text,
  dom text,
  escopo text
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with contexto as (
    select
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'colaborador') as papel,
      (
        select uv.colaborador_id
        from public.usuarios_vinculos uv
        where uv.usuario_id = auth.uid()
        limit 1
      ) as colaborador_id
  )
  select
    c.id,
    c.nome,
    c.funcao,
    coalesce(e.semana_inicio, semana_inicio_param),
    e.seg,
    e.ter,
    e.qua,
    e.qui,
    e.sex,
    e.sab,
    e.dom,
    case when ctx.papel in ('admin', 'socio') then 'equipe' else 'pessoal' end
  from public.colaboradores c
  cross join contexto ctx
  left join public.escala e
    on e.colaborador_id = c.id
   and e.semana_inicio = semana_inicio_param
  where auth.uid() is not null
    and private.usuario_pode_acessar('dashboard')
    and c.ativo
    and c.participa_escala
    and (
      ctx.papel in ('admin', 'socio')
      or c.id = ctx.colaborador_id
    )
  order by c.nome;
$$;

revoke all on function public.listar_escala_dashboard(date) from public, anon;
grant execute on function public.listar_escala_dashboard(date) to authenticated;

create or replace function public.listar_meu_trabalho_dashboard()
returns table (
  id text,
  titulo text,
  origem text,
  href text,
  prazo date,
  status text,
  detalhe text,
  pode_abrir boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with pessoa as (
    select c.id, c.nome
    from public.usuarios_vinculos uv
    join public.colaboradores c on c.id = uv.colaborador_id
    where uv.usuario_id = auth.uid()
    limit 1
  ), itens as (
    select
      'kanban-' || k.id::text as id,
      k.titulo,
      case when k.titulo like 'Pré-preparo:%' then 'Produção · Pré-preparo' else 'Kanban' end as origem,
      '/kanban'::text as href,
      k.prazo,
      k.status,
      k.descricao as detalhe,
      private.usuario_pode_acessar('kanban') as pode_abrir
    from public.kanban_tarefas k
    join pessoa p on p.id = k.responsavel_id
    where k.status <> 'concluido'

    union all

    select
      'reuniao-' || r.id::text,
      r.descricao,
      'Reuniões',
      '/reunioes',
      r.prazo,
      r.status,
      null::text,
      private.usuario_pode_acessar('reunioes')
    from public.reunioes_itens r
    join pessoa p on p.id = r.responsavel_id
    where r.status <> 'concluido'

    union all

    select
      'fornecedor-' || f.id::text,
      'Pagamento: ' || f.fornecedor,
      'Fornecedores',
      '/pagamentos-fornecedores',
      f.vencimento,
      'pendente',
      to_char(f.valor, 'FM999G999G990D00'),
      private.usuario_pode_acessar('pagamentos_fornecedores')
    from public.pagamentos_fornecedores f
    join pessoa p on (
      p.id = any(coalesce(f.responsavel_ids, '{}'::uuid[]))
      or lower(p.nome) = lower(coalesce(f.responsavel, ''))
    )
    where f.pago_em is null

    union all

    select
      'motoboy-' || m.id::text,
      'Pagamento: ' || coalesce(m.motoboy_nome, 'Motoboy'),
      'Motoboys',
      '/pagamentos-motoboys',
      m.data,
      'pendente',
      to_char(coalesce(m.total, 0), 'FM999G999G990D00'),
      private.usuario_pode_acessar('pagamentos_motoboys')
    from public.pagamentos_motoboys m
    join pessoa p on (
      p.id = any(coalesce(m.responsavel_ids, '{}'::uuid[]))
      or lower(p.nome) = lower(coalesce(m.responsavel, ''))
    )
    where m.pago_em is null

    union all

    select
      'juridico-' || d.id::text,
      d.titulo,
      'Jurídico',
      '/juridico',
      d.prazo,
      d.status,
      null::text,
      private.usuario_pode_acessar('juridico')
    from public.demandas_juridicas d
    join pessoa p on p.id = d.responsavel_id
    where d.status <> 'concluido'

    union all

    select
      'contrato-' || c.id::text,
      c.titulo,
      'Contratos',
      '/juridico',
      c.vencimento,
      c.status,
      null::text,
      private.usuario_pode_acessar('juridico')
    from public.contratos c
    join pessoa p on p.id = c.responsavel_id
    where c.status not in ('assinado', 'arquivado')
  )
  select i.id, i.titulo, i.origem, i.href, i.prazo, i.status, i.detalhe, i.pode_abrir
  from itens i
  where auth.uid() is not null
    and private.usuario_pode_acessar('dashboard')
  order by i.prazo nulls last, i.titulo;
$$;

revoke all on function public.listar_meu_trabalho_dashboard() from public, anon;
grant execute on function public.listar_meu_trabalho_dashboard() to authenticated;

create or replace function public.resumo_dashboard_v1(semana_inicio_param date)
returns table (
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
      select count(*) from public.pagamentos_fornecedores where pago_em is null
    ) else 0 end,
    case when private.usuario_pode_acessar('dashboard_fornecedores') then (
      select coalesce(sum(valor), 0) from public.pagamentos_fornecedores where pago_em is null
    ) else 0 end,
    case when private.usuario_pode_acessar('dashboard_motoboys') then (
      select count(*) from public.pagamentos_motoboys where pago_em is null
    ) else 0 end,
    case when private.usuario_pode_acessar('dashboard_motoboys') then (
      select coalesce(sum(total), 0) from public.pagamentos_motoboys where pago_em is null
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

revoke all on function public.resumo_dashboard_v1(date) from public, anon;
grant execute on function public.resumo_dashboard_v1(date) to authenticated;
