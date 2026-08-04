alter table public.pagamentos_fornecedores
  add column if not exists responsavel_ids uuid[] not null default '{}'::uuid[],
  add column if not exists responsavel_nomes text[] not null default '{}'::text[];

alter table public.pagamentos_motoboys
  add column if not exists responsavel_ids uuid[] not null default '{}'::uuid[],
  add column if not exists responsavel_nomes text[] not null default '{}'::text[];

update public.pagamentos_fornecedores p
set responsavel_ids = array[c.id],
    responsavel_nomes = array[c.nome]
from public.colaboradores c
where p.responsavel is not null
  and cardinality(p.responsavel_ids) = 0
  and lower(btrim(c.nome)) = lower(btrim(p.responsavel));

update public.pagamentos_motoboys p
set responsavel_ids = array[c.id],
    responsavel_nomes = array[c.nome]
from public.colaboradores c
where p.responsavel is not null
  and cardinality(p.responsavel_ids) = 0
  and lower(btrim(c.nome)) = lower(btrim(p.responsavel));

create or replace function private.sincronizar_responsaveis_pagamento()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  pessoa_id uuid;
  pessoa_nome text;
begin
  if tg_op = 'INSERT' then
    if cardinality(new.responsavel_ids) = 0 and nullif(btrim(new.responsavel), '') is not null then
      select c.id, c.nome into pessoa_id, pessoa_nome
      from public.colaboradores c
      where lower(btrim(c.nome)) = lower(btrim(new.responsavel))
      order by c.ativo desc, c.created_at
      limit 1;
      if pessoa_id is not null then
        new.responsavel_ids := array[pessoa_id];
        new.responsavel_nomes := array[pessoa_nome];
      end if;
    end if;
  elsif new.responsavel is distinct from old.responsavel
    and new.responsavel_ids is not distinct from old.responsavel_ids
    and new.responsavel_nomes is not distinct from old.responsavel_nomes then
    new.responsavel_ids := '{}'::uuid[];
    new.responsavel_nomes := '{}'::text[];
    if nullif(btrim(new.responsavel), '') is not null then
      select c.id, c.nome into pessoa_id, pessoa_nome
      from public.colaboradores c
      where lower(btrim(c.nome)) = lower(btrim(new.responsavel))
      order by c.ativo desc, c.created_at
      limit 1;
      if pessoa_id is not null then
        new.responsavel_ids := array[pessoa_id];
        new.responsavel_nomes := array[pessoa_nome];
      end if;
    end if;
  end if;

  if cardinality(new.responsavel_nomes) > 0 then
    new.responsavel := new.responsavel_nomes[1];
  elsif cardinality(new.responsavel_ids) = 0 then
    new.responsavel := nullif(btrim(new.responsavel), '');
  end if;

  return new;
end;
$function$;

drop trigger if exists sincronizar_responsaveis_fornecedor_trigger on public.pagamentos_fornecedores;
create trigger sincronizar_responsaveis_fornecedor_trigger
before insert or update on public.pagamentos_fornecedores
for each row execute function private.sincronizar_responsaveis_pagamento();

drop trigger if exists sincronizar_responsaveis_motoboy_trigger on public.pagamentos_motoboys;
create trigger sincronizar_responsaveis_motoboy_trigger
before insert or update on public.pagamentos_motoboys
for each row execute function private.sincronizar_responsaveis_pagamento();

drop function if exists public.listar_pagamentos_fornecedores();
create function public.listar_pagamentos_fornecedores()
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
  anexo_path text,
  responsavel_ids uuid[],
  responsavel_nomes text[]
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
    case when private.usuario_pode_acessar('pagamentos_fornecedores') then p.anexo_path else null end,
    p.responsavel_ids,
    p.responsavel_nomes
  from public.pagamentos_fornecedores p
  where auth.uid() is not null
    and (
      private.usuario_pode_acessar('pagamentos_fornecedores')
      or private.usuario_pode_acessar('dashboard_fornecedores')
    );
$function$;

revoke all on function public.listar_pagamentos_fornecedores() from public, anon;
grant execute on function public.listar_pagamentos_fornecedores() to authenticated, service_role;

drop function if exists public.listar_pagamentos_motoboys();
create function public.listar_pagamentos_motoboys()
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
  rastreio_anexo_path text,
  responsavel_ids uuid[],
  responsavel_nomes text[]
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
    case when private.usuario_pode_acessar('pagamentos_motoboys') then p.rastreio_anexo_path else null end,
    p.responsavel_ids,
    p.responsavel_nomes
  from public.pagamentos_motoboys p
  where auth.uid() is not null
    and (
      private.usuario_pode_acessar('pagamentos_motoboys')
      or private.usuario_pode_acessar('dashboard_motoboys')
    );
$function$;

revoke all on function public.listar_pagamentos_motoboys() from public, anon;
grant execute on function public.listar_pagamentos_motoboys() to authenticated, service_role;

notify pgrst, 'reload schema';
