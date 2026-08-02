-- Exclusões seguras da Produção com auditoria e preservação do histórico consumido.

create or replace function public.excluir_insumo_producao(insumo_id_param uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  possui_historico boolean;
begin
  if (select auth.uid()) is null
    or not private.usuario_pode_acessar('producao_estoque') then
    raise exception 'Acesso negado';
  end if;
  if not exists (select 1 from public.producao_insumos where id = insumo_id_param) then
    raise exception 'Insumo não encontrado';
  end if;

  select exists (
    select 1 from public.producao_consumos where insumo_id = insumo_id_param
  ) into possui_historico;

  -- Remove apenas dependências operacionais/futuras. Consumos realizados são preservados.
  delete from public.producao_lista_compras where insumo_id = insumo_id_param;
  delete from public.producao_reservas_insumos where insumo_id = insumo_id_param;
  delete from public.producao_receitas where insumo_id = insumo_id_param;

  if possui_historico then
    update public.producao_insumos
    set ativo = false, updated_at = now()
    where id = insumo_id_param;
    perform private.recalcular_reservas_e_compras();
    return 'arquivado';
  end if;

  delete from public.producao_insumos where id = insumo_id_param;
  perform private.recalcular_reservas_e_compras();
  return 'excluido';
end;
$$;

revoke all on function public.excluir_insumo_producao(uuid) from public, anon;
grant execute on function public.excluir_insumo_producao(uuid) to authenticated, service_role;

-- Inclui os registros da Produção no histórico geral do ERP.
do $$
declare
  nome_tabela text;
begin
  foreach nome_tabela in array array[
    'producao_insumos', 'producao_lista_compras', 'producao_planejamento'
  ] loop
    if to_regclass('public.' || nome_tabela) is not null then
      execute format('drop trigger if exists registrar_auditoria_erp on public.%I', nome_tabela);
      execute format(
        'create trigger registrar_auditoria_erp after insert or update or delete on public.%I for each row execute function private.registrar_auditoria_erp()',
        nome_tabela
      );
    end if;
  end loop;
end;
$$;
