drop function if exists public.listar_motoboys();

create function public.listar_motoboys()
returns table(
  id uuid,
  nome text,
  pix text,
  pix_tipo text,
  whatsapp text,
  valor_diaria numeric,
  ativo boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    m.id,
    m.nome,
    case
      when private.usuario_pode_acessar('cadastros')
        or private.usuario_pode_acessar('pagamentos_motoboys')
      then m.pix
      else null
    end,
    case
      when private.usuario_pode_acessar('cadastros')
        or private.usuario_pode_acessar('pagamentos_motoboys')
      then m.pix_tipo
      else null
    end,
    case
      when private.usuario_pode_acessar('cadastros')
        or private.usuario_pode_acessar('pagamentos_motoboys')
      then m.whatsapp
      else null
    end,
    case
      when private.usuario_pode_acessar('cadastros')
        or private.usuario_pode_acessar('pagamentos_motoboys')
      then m.valor_diaria
      else null
    end,
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
$$;

grant execute on function public.listar_motoboys() to authenticated;

notify pgrst, 'reload schema';
