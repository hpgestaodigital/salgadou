-- Separa o status geral do cadastro da participação na escala semanal.
alter table public.colaboradores
  add column if not exists participa_escala boolean not null default true;

comment on column public.colaboradores.participa_escala is
  'Define se a pessoa ativa deve aparecer na Escala Semanal.';

-- Pedro permanece ativo para reuniões, acompanhamentos e demais módulos,
-- mas não compõe a operação presencial da escala.
update public.colaboradores
set participa_escala = false
where lower(btrim(nome)) = 'pedro milagres'
  and lower(coalesce(tipo, '')) = 'sócio';

-- Remove apenas linhas vazias criadas automaticamente no passado.
-- Registros históricos com horários ou observações são preservados.
delete from public.escala e
using public.colaboradores c
where e.colaborador_id = c.id
  and c.participa_escala = false
  and e.seg is null
  and e.ter is null
  and e.qua is null
  and e.qui is null
  and e.sex is null
  and e.sab is null
  and e.dom is null
  and e.observacoes is null;

drop function if exists public.listar_colaboradores();

create function public.listar_colaboradores()
returns table(
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
  notificacoes_whatsapp boolean,
  participa_escala boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
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
    c.notificacoes_whatsapp,
    c.participa_escala
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

revoke all on function public.listar_colaboradores() from public, anon;
grant execute on function public.listar_colaboradores() to authenticated, service_role;

notify pgrst, 'reload schema';
