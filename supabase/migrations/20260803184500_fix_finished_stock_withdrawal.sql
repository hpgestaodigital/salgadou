-- Valida a ordem do fluxo apenas quando o status realmente muda para empacotado.
-- Atualizações de saldo em um lote já empacotado não são uma nova transição de etapa.
create or replace function private.validar_fluxo_lote()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.status is distinct from old.status
     and new.status = 'empacotado'
     and old.status <> 'aguardando_empacotamento' then
    raise exception 'O lote precisa ser marcado como congelado antes do empacotamento';
  end if;

  return new;
end;
$$;
