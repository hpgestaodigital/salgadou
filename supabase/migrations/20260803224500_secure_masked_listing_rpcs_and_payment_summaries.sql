-- Reforça as RPCs mascaradas para respeitarem os mesmos módulos das políticas RLS.
create or replace function public.listar_colaboradores()
returns table (
  id uuid,
  nome text,
  whatsapp text,
  tipo text,
  valor_diaria numeric,
  funcao text,
  ativo boolean,
  created_at timestamptz,
  modalidade_pagamento text,
  periodicidade_pagamento text,
  valor_pagamento numeric,
  observacoes_contrato text,
  notificacoes_whatsapp boolean
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select
    c.id,
    c.nome,
    case
      when private.usuario_pode_acessar('cadastros')
        or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','financeiro','socio')
        or exists (
          select 1 from public.usuarios_vinculos uv
          where uv.usuario_id = auth.uid() and uv.colaborador_id = c.id
        )
      then c.whatsapp else null
    end,
    c.tipo,
    case when private.usuario_pode_acessar('cadastros') then c.valor_diaria else null end,
    c.funcao,
    c.ativo,
    c.created_at,
    case when private.usuario_pode_acessar('cadastros') then c.modalidade_pagamento else null end,
    case when private.usuario_pode_acessar('cadastros') then c.periodicidade_pagamento else null end,
    case when private.usuario_pode_acessar('cadastros') then c.valor_pagamento else null end,
    case when private.usuario_pode_acessar('cadastros') then c.observacoes_contrato else null end,
    c.notificacoes_whatsapp
  from public.colaboradores c
  where auth.uid() is not null
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
    );
$function$;

create or replace function public.listar_motoboys()
returns table (
  id uuid,
  nome text,
  pix text,
  whatsapp text,
  valor_diaria numeric,
  ativo boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select
    m.id,
    m.nome,
    case when private.usuario_pode_acessar('cadastros') or private.usuario_pode_acessar('pagamentos_motoboys') then m.pix else null end,
    case when private.usuario_pode_acessar('cadastros') or private.usuario_pode_acessar('pagamentos_motoboys') then m.whatsapp else null end,
    case when private.usuario_pode_acessar('cadastros') or private.usuario_pode_acessar('pagamentos_motoboys') then m.valor_diaria else null end,
    m.ativo,
    m.created_at
  from public.motoboys m
  where auth.uid() is not null
    and (
      private.usuario_pode_acessar('cadastros')
      or private.usuario_pode_acessar('pagamentos_motoboys')
      or private.usuario_pode_acessar('dashboard_motoboys')
      or private.usuario_pode_acessar('dashboard')
    );
$function$;

create or replace function public.listar_fornecedores()
returns table (
  id uuid,
  nome text,
  whatsapp text,
  observacao text,
  ativo boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select
    f.id,
    f.nome,
    case when private.usuario_pode_acessar('cadastros') or private.usuario_pode_acessar('pagamentos_fornecedores') then f.whatsapp else null end,
    case when private.usuario_pode_acessar('cadastros') or private.usuario_pode_acessar('pagamentos_fornecedores') then f.observacao else null end,
    f.ativo,
    f.created_at
  from public.fornecedores f
  where auth.uid() is not null
    and (
      private.usuario_pode_acessar('cadastros')
      or private.usuario_pode_acessar('pagamentos_fornecedores')
      or private.usuario_pode_acessar('producao_compras')
      or private.usuario_pode_acessar('dashboard_fornecedores')
    );
$function$;

-- Pagamentos de fornecedores: o resumo da Dashboard não recebe observações nem anexos.
revoke select on table public.pagamentos_fornecedores from authenticated;
grant select (id, pedido, vencimento, fornecedor, valor, pago_em, responsavel, created_at)
  on table public.pagamentos_fornecedores to authenticated;

create or replace function public.listar_pagamentos_fornecedores()
returns table (
  id uuid,
  pedido text,
  vencimento date,
  fornecedor text,
  valor numeric,
  observacao text,
  pago_em date,
  comprovante text,
  responsavel text,
  created_at timestamptz,
  anexo_url text,
  anexo_path text
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select
    p.id,
    p.pedido,
    p.vencimento,
    p.fornecedor,
    p.valor,
    case when private.usuario_pode_acessar('pagamentos_fornecedores') then p.observacao else null end,
    p.pago_em,
    case when private.usuario_pode_acessar('pagamentos_fornecedores') then p.comprovante else null end,
    p.responsavel,
    p.created_at,
    case when private.usuario_pode_acessar('pagamentos_fornecedores') then p.anexo_url else null end,
    case when private.usuario_pode_acessar('pagamentos_fornecedores') then p.anexo_path else null end
  from public.pagamentos_fornecedores p
  where auth.uid() is not null
    and (
      private.usuario_pode_acessar('pagamentos_fornecedores')
      or private.usuario_pode_acessar('dashboard_fornecedores')
    );
$function$;

-- Pagamentos de motoboys: PIX, observações e anexos ficam fora do resumo.
revoke select on table public.pagamentos_motoboys from authenticated;
grant select (
  id, data, motoboy_id, motoboy_nome, numero_entregas, valor_taxas,
  valor_diaria, total, pago_em, responsavel, created_at
) on table public.pagamentos_motoboys to authenticated;

create or replace function public.listar_pagamentos_motoboys()
returns table (
  id uuid,
  data date,
  motoboy_id uuid,
  motoboy_nome text,
  numero_entregas integer,
  valor_taxas numeric,
  valor_diaria numeric,
  total numeric,
  pix text,
  pago_em date,
  observacao text,
  created_at timestamptz,
  anexo_url text,
  anexo_path text,
  responsavel text,
  rastreio_anexo_url text,
  rastreio_anexo_path text
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select
    p.id,
    p.data,
    p.motoboy_id,
    p.motoboy_nome,
    p.numero_entregas,
    p.valor_taxas,
    p.valor_diaria,
    p.total,
    case when private.usuario_pode_acessar('pagamentos_motoboys') then p.pix else null end,
    p.pago_em,
    case when private.usuario_pode_acessar('pagamentos_motoboys') then p.observacao else null end,
    p.created_at,
    case when private.usuario_pode_acessar('pagamentos_motoboys') then p.anexo_url else null end,
    case when private.usuario_pode_acessar('pagamentos_motoboys') then p.anexo_path else null end,
    p.responsavel,
    case when private.usuario_pode_acessar('pagamentos_motoboys') then p.rastreio_anexo_url else null end,
    case when private.usuario_pode_acessar('pagamentos_motoboys') then p.rastreio_anexo_path else null end
  from public.pagamentos_motoboys p
  where auth.uid() is not null
    and (
      private.usuario_pode_acessar('pagamentos_motoboys')
      or private.usuario_pode_acessar('dashboard_motoboys')
    );
$function$;

revoke all on function public.listar_colaboradores() from public, anon;
revoke all on function public.listar_motoboys() from public, anon;
revoke all on function public.listar_fornecedores() from public, anon;
revoke all on function public.listar_pagamentos_fornecedores() from public, anon;
revoke all on function public.listar_pagamentos_motoboys() from public, anon;

grant execute on function public.listar_colaboradores() to authenticated;
grant execute on function public.listar_motoboys() to authenticated;
grant execute on function public.listar_fornecedores() to authenticated;
grant execute on function public.listar_pagamentos_fornecedores() to authenticated;
grant execute on function public.listar_pagamentos_motoboys() to authenticated;

notify pgrst, 'reload schema';
