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
      and not exists (
        select 1
        from public.kanban_tarefas k
        where k.responsavel_id = r.responsavel_id
          and k.titulo = r.descricao
          and k.prazo is not distinct from r.prazo
          and k.descricao like 'Origem: reunião %'
      )

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
