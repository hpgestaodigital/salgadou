-- Motoboys: nomes/status continuam disponíveis à Dashboard; PIX, contato e diária
-- só aparecem para Cadastros ou Pagamentos de Motoboys.
revoke select on table public.motoboys from authenticated;
grant select (id, nome, ativo, created_at) on table public.motoboys to authenticated;

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
  where auth.uid() is not null;
$function$;

revoke all on function public.listar_motoboys() from public, anon;
grant execute on function public.listar_motoboys() to authenticated;

-- Fornecedores: nome/status podem apoiar seleção e planejamento; contato e observação
-- ficam restritos a Cadastros ou Pagamentos de Fornecedores.
revoke select on table public.fornecedores from authenticated;
grant select (id, nome, ativo, created_at) on table public.fornecedores to authenticated;

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
  where auth.uid() is not null;
$function$;

revoke all on function public.listar_fornecedores() from public, anon;
grant execute on function public.listar_fornecedores() to authenticated;

notify pgrst, 'reload schema';
