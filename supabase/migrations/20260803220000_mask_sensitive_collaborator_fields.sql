-- Remove leitura irrestrita da tabela completa.
revoke select on table public.colaboradores from authenticated;

-- Consultas explícitas de dados operacionais continuam permitidas e obedecem ao RLS.
grant select (
  id,
  nome,
  whatsapp,
  tipo,
  funcao,
  ativo,
  created_at,
  notificacoes_whatsapp
) on table public.colaboradores to authenticated;

-- A função mantém o formato utilizado pelo front-end, mas mascara remuneração e
-- informações contratuais para quem não possui acesso ao módulo Cadastros.
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
    c.whatsapp,
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
  where auth.uid() is not null;
$function$;

revoke all on function public.listar_colaboradores() from public, anon;
grant execute on function public.listar_colaboradores() to authenticated;

notify pgrst, 'reload schema';
