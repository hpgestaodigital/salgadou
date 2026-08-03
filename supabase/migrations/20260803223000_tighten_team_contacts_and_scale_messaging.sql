-- O contato da equipe deixa de ser uma coluna de leitura direta geral.
revoke select (whatsapp) on table public.colaboradores from authenticated;

-- Mantém o mesmo contrato de retorno, mas expõe WhatsApp somente:
-- 1) ao próprio usuário vinculado;
-- 2) a quem gerencia Cadastros;
-- 3) aos perfis que podem editar/enviar a Escala pelo banco.
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
          select 1
          from public.usuarios_vinculos uv
          where uv.usuario_id = auth.uid()
            and uv.colaborador_id = c.id
        )
      then c.whatsapp
      else null
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
  where auth.uid() is not null;
$function$;

revoke all on function public.listar_colaboradores() from public, anon;
grant execute on function public.listar_colaboradores() to authenticated;

notify pgrst, 'reload schema';
