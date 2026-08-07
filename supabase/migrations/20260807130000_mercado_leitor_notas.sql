-- Leitor de notas fiscais do módulo Mercado.
-- Estrutura aditiva: preserva o fluxo transacional atual de compras/estoque.

-- Permite XML de NF-e/NFC-e no mesmo bucket privado já usado pelas compras.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime)
  from unnest(
    coalesce(allowed_mime_types, array[]::text[])
    || array['application/xml', 'text/xml']::text[]
  ) as mime
)
where id = 'erp-payment-attachments';

-- Uma compra pode ter várias fotos (notas compridas), PDF ou XML.
alter table public.mercado_compras
  add column if not exists nota_paths text[] not null default '{}'::text[];

update public.mercado_compras
set nota_paths = array[nota_path]
where nota_path is not null
  and cardinality(nota_paths) = 0;

-- Mantém a descrição original e a categoria reconhecida para auditoria/relatórios.
alter table public.mercado_compra_itens
  add column if not exists descricao_origem text,
  add column if not exists categoria text;

-- Memória de correspondência: a correção feita pelo usuário passa a ser reutilizada.
create table if not exists public.mercado_produto_mapeamentos (
  id                    uuid primary key default gen_random_uuid(),
  origem_chave          text not null default '',
  descricao_normalizada text not null,
  descricao_exemplo     text not null,
  insumo_id             uuid not null references public.producao_insumos(id) on delete cascade,
  fator_quantidade      numeric(14,6) not null default 1 check (fator_quantidade > 0),
  categoria             text,
  criado_por            uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint mercado_produto_mapeamentos_unique unique (origem_chave, descricao_normalizada)
);

create index if not exists mercado_produto_mapeamentos_insumo_idx
  on public.mercado_produto_mapeamentos (insumo_id);

alter table public.mercado_produto_mapeamentos enable row level security;

drop policy if exists "Mercado consulta mapeamentos" on public.mercado_produto_mapeamentos;
create policy "Mercado consulta mapeamentos"
  on public.mercado_produto_mapeamentos for select to authenticated
  using (private.usuario_pode_acessar('producao_compras'));

drop policy if exists "Mercado cria mapeamentos" on public.mercado_produto_mapeamentos;
create policy "Mercado cria mapeamentos"
  on public.mercado_produto_mapeamentos for insert to authenticated
  with check (
    private.usuario_pode_acessar('producao_compras')
    and criado_por = (select auth.uid())
  );

drop policy if exists "Mercado atualiza mapeamentos" on public.mercado_produto_mapeamentos;
create policy "Mercado atualiza mapeamentos"
  on public.mercado_produto_mapeamentos for update to authenticated
  using (private.usuario_pode_acessar('producao_compras'))
  with check (private.usuario_pode_acessar('producao_compras'));

grant select, insert, update on public.mercado_produto_mapeamentos to authenticated;
grant all on public.mercado_produto_mapeamentos to service_role;

-- V2 envolve a RPC existente, de forma que toda movimentação continue passando
-- pelo ledger/validações já implantados no ERP.
create or replace function public.registrar_compra_mercado_v2(
  p_fornecedor_id    uuid,
  p_data_compra      date,
  p_itens            jsonb,
  p_observacoes      text default null,
  p_nota_paths       text[] default '{}'::text[],
  p_local_compra     text default null,
  p_idempotency_key  uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_compra_id uuid;
  v_item jsonb;
  v_path text;
begin
  if v_usuario_id is null
    or not private.usuario_pode_acessar('producao_compras') then
    raise exception 'Acesso negado';
  end if;

  foreach v_path in array coalesce(p_nota_paths, '{}'::text[])
  loop
    if v_path is null or v_path !~ ('^purchases/' || v_usuario_id::text || '/') then
      raise exception 'Caminho de nota fiscal inválido';
    end if;
  end loop;

  v_compra_id := public.registrar_compra_mercado(
    p_fornecedor_id,
    p_data_compra,
    p_itens,
    p_observacoes,
    case when cardinality(coalesce(p_nota_paths, '{}'::text[])) > 0 then p_nota_paths[1] else null end,
    p_local_compra,
    p_idempotency_key
  );

  update public.mercado_compras
  set nota_paths = coalesce(p_nota_paths, '{}'::text[]),
      nota_path = case when cardinality(coalesce(p_nota_paths, '{}'::text[])) > 0 then p_nota_paths[1] else nota_path end
  where id = v_compra_id;

  -- A RPC antiga ignora campos extras do JSON; aqui usamos esses campos somente
  -- para enriquecer os itens já registrados sem duplicar movimentações.
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    update public.mercado_compra_itens
    set descricao_origem = nullif(btrim(v_item->>'descricao_origem'), ''),
        categoria = nullif(btrim(v_item->>'categoria'), '')
    where compra_id = v_compra_id
      and insumo_id = (v_item->>'insumo_id')::uuid;
  end loop;

  return v_compra_id;
end;
$$;

revoke all on function public.registrar_compra_mercado_v2(uuid, date, jsonb, text, text[], text, uuid)
  from public, anon;
grant execute on function public.registrar_compra_mercado_v2(uuid, date, jsonb, text, text[], text, uuid)
  to authenticated, service_role;
