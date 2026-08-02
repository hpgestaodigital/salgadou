-- Limpeza definitiva somente dos registros inequivocamente marcados como exemplo/demo.

do $$
declare
  produtos_exemplo uuid[];
  insumos_exemplo uuid[];
  planos_exemplo uuid[];
  contratos_exemplo uuid[];
  demandas_exemplo uuid[];
  documentos_exemplo uuid[];
  reunioes_exemplo uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[]) into produtos_exemplo
  from public.producao_produtos where nome ilike '[EXEMPLO]%';
  select coalesce(array_agg(id), array[]::uuid[]) into insumos_exemplo
  from public.producao_insumos where nome ilike '[EXEMPLO]%';
  select coalesce(array_agg(id), array[]::uuid[]) into planos_exemplo
  from public.producao_planejamento
  where produto_id = any(produtos_exemplo) or observacoes ilike '[EXEMPLO]%';

  delete from public.producao_consumos where planejamento_id = any(planos_exemplo);
  delete from public.producao_reservas_insumos where planejamento_id = any(planos_exemplo) or insumo_id = any(insumos_exemplo);
  delete from public.producao_planejamento where id = any(planos_exemplo);
  delete from public.producao_receitas where produto_id = any(produtos_exemplo) or insumo_id = any(insumos_exemplo);
  delete from public.producao_lista_compras
  where insumo_id = any(insumos_exemplo) or observacoes ilike '[EXEMPLO]%';
  delete from public.producao_estoque_final where produto_id = any(produtos_exemplo);
  delete from public.producao_produtos where id = any(produtos_exemplo);
  delete from public.producao_insumos where id = any(insumos_exemplo);

  select coalesce(array_agg(id), array[]::uuid[]) into contratos_exemplo
  from public.contratos where titulo ilike '[EXEMPLO]%';
  select coalesce(array_agg(id), array[]::uuid[]) into demandas_exemplo
  from public.demandas_juridicas where titulo ilike '[EXEMPLO]%';
  select coalesce(array_agg(id), array[]::uuid[]) into documentos_exemplo
  from public.documentos_juridicos
  where titulo ilike '[EXEMPLO]%' or referencia ilike '%DEMO%';

  delete from public.documentos_juridicos where id = any(documentos_exemplo);
  delete from public.demandas_juridicas where id = any(demandas_exemplo);
  delete from public.contratos where id = any(contratos_exemplo);

  if to_regclass('public.reunioes') is not null then
    select coalesce(array_agg(id), array[]::uuid[]) into reunioes_exemplo
    from public.reunioes where titulo ilike '[EXEMPLO]%' or titulo ilike '%reunião de exemplo%';
    delete from public.reunioes where id = any(reunioes_exemplo);
  end if;

  -- Remove do histórico apenas as entradas dos registros fictícios apagados.
  if to_regclass('public.auditoria_acoes') is not null then
    delete from public.auditoria_acoes
    where registro_id = any(
      produtos_exemplo || insumos_exemplo || planos_exemplo || contratos_exemplo ||
      demandas_exemplo || documentos_exemplo || coalesce(reunioes_exemplo, array[]::uuid[])
    );
  end if;

  perform private.recalcular_reservas_e_compras();
end;
$$;
