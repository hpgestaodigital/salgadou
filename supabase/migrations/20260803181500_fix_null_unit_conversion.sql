-- Preparos ainda sem lote aparecem no LEFT JOIN com quantidade e unidade nulas.
-- Quantidade nula representa ausência de estoque e deve resultar em NULL para o SUM/COALESCE.
create or replace function private.converter_unidade_producao(
  valor numeric,
  unidade_origem text,
  unidade_destino text
)
returns numeric
language plpgsql
immutable
set search_path = pg_catalog, public, private
as $$
begin
  if valor is null then
    return null;
  end if;

  if unidade_origem is null or unidade_destino is null then
    raise exception 'Unidade não informada para conversão: % e %', unidade_origem, unidade_destino;
  end if;

  if unidade_origem = unidade_destino then return valor; end if;
  if unidade_origem = 'g' and unidade_destino = 'kg' then return valor / 1000; end if;
  if unidade_origem = 'kg' and unidade_destino = 'g' then return valor * 1000; end if;
  if unidade_origem = 'ml' and unidade_destino = 'l' then return valor / 1000; end if;
  if unidade_origem = 'l' and unidade_destino = 'ml' then return valor * 1000; end if;

  raise exception 'Unidades incompatíveis: % e %', unidade_origem, unidade_destino;
end;
$$;

notify pgrst, 'reload schema';
