-- Módulo Mercado: registro seguro de compras realizadas.
-- Depende de: public.producao_insumos, public.fornecedores e private.usuario_pode_acessar.
-- Esta migration NÃO altera nem apaga dados existentes.

-- 1. Bucket privado: preservar configurações existentes e apenas ampliar compatibilidade.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-payment-attachments',
  'erp-payment-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = greatest(
    coalesce(storage.buckets.file_size_limit, 0),
    excluded.file_size_limit
  ),
  allowed_mime_types = (
    select array_agg(distinct mime)
    from unnest(
      coalesce(storage.buckets.allowed_mime_types, array[]::text[])
      || excluded.allowed_mime_types
    ) as mime
  );

-- 2. Cabeçalho da compra.
create table if not exists public.mercado_compras (
  id               uuid primary key default gen_random_uuid(),
  fornecedor_id    uuid references public.fornecedores(id) on delete restrict,
  local_compra     text,
  data_compra      date not null,
  valor_total      numeric(12,2) not null default 0 check (valor_total >= 0),
  nota_path        text,
  observacoes      text,
  idempotency_key  uuid not null,
  criado_por       uuid not null references auth.users(id) on delete restrict,
  created_at       timestamptz not null default now(),
  constraint mercado_compras_origem_check check (
    fornecedor_id is not null or nullif(btrim(local_compra), '') is not null
  ),
  constraint mercado_compras_idempotency_unique unique (criado_por, idempotency_key)
);

create index if not exists mercado_compras_data_idx
  on public.mercado_compras (data_compra desc);
create index if not exists mercado_compras_fornecedor_idx
  on public.mercado_compras (fornecedor_id);

-- 3. Itens da compra. A unidade é uma fotografia do cadastro no momento da compra.
create table if not exists public.mercado_compra_itens (
  id                    uuid primary key default gen_random_uuid(),
  compra_id             uuid not null references public.mercado_compras(id) on delete restrict,
  insumo_id             uuid not null references public.producao_insumos(id) on delete restrict,
  quantidade_comprada   numeric(14,4) not null check (quantidade_comprada > 0),
  unidade               text not null,
  preco_unitario        numeric(12,4) not null check (preco_unitario >= 0),
  preco_total           numeric(12,2) not null check (preco_total >= 0)
);

create index if not exists mercado_compra_itens_compra_idx
  on public.mercado_compra_itens (compra_id);
create index if not exists mercado_compra_itens_insumo_idx
  on public.mercado_compra_itens (insumo_id);

-- 4. RLS: o frontend pode consultar, mas não alterar diretamente compras já registradas.
alter table public.mercado_compras enable row level security;
alter table public.mercado_compra_itens enable row level security;

drop policy if exists "Mercado consulta compras" on public.mercado_compras;
drop policy if exists "Mercado consulta itens" on public.mercado_compra_itens;
drop policy if exists "Permissão de módulo mercado_compras" on public.mercado_compras;
drop policy if exists "Permissão de módulo mercado_compra_itens" on public.mercado_compra_itens;

create policy "Mercado consulta compras"
  on public.mercado_compras for select to authenticated
  using (private.usuario_pode_acessar('producao_compras'));

create policy "Mercado consulta itens"
  on public.mercado_compra_itens for select to authenticated
  using (private.usuario_pode_acessar('producao_compras'));

-- 5. Storage privado na pasta purchases/{uid}/.
drop policy if exists "Mercado le notas de compra" on storage.objects;
create policy "Mercado le notas de compra" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'erp-payment-attachments'
    and (storage.foldername(name))[1] = 'purchases'
    and private.usuario_pode_acessar('producao_compras')
  );

drop policy if exists "Mercado envia nota de compra" on storage.objects;
create policy "Mercado envia nota de compra" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'erp-payment-attachments'
    and (storage.foldername(name))[1] = 'purchases'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.usuario_pode_acessar('producao_compras')
  );

drop policy if exists "Mercado remove nota de compra" on storage.objects;
create policy "Mercado remove nota de compra" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'erp-payment-attachments'
    and (storage.foldername(name))[1] = 'purchases'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.usuario_pode_acessar('producao_compras')
    and not exists (
      select 1
      from public.mercado_compras compra
      where compra.nota_path = storage.objects.name
    )
  );

-- 6. RPC transacional e idempotente.
create or replace function public.registrar_compra_mercado(
  p_fornecedor_id    uuid,
  p_data_compra      date,
  p_itens            jsonb,
  p_observacoes      text default null,
  p_nota_path        text default null,
  p_local_compra     text default null,
  p_idempotency_key  uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_usuario_id  uuid := (select auth.uid());
  v_compra_id   uuid;
  v_total       numeric(12,2) := 0;
  v_item        jsonb;
  v_insumo_id   uuid;
  v_qtd         numeric(14,4);
  v_preco       numeric(12,4);
  v_linha       numeric(12,2);
  v_unidade     text;
begin
  if v_usuario_id is null
    or not private.usuario_pode_acessar('producao_compras') then
    raise exception 'Acesso negado';
  end if;

  if p_data_compra is null then
    raise exception 'Data da compra é obrigatória';
  end if;

  if p_itens is null
    or jsonb_typeof(p_itens) <> 'array'
    or jsonb_array_length(p_itens) = 0 then
    raise exception 'É necessário informar ao menos um item';
  end if;

  if p_fornecedor_id is null and nullif(btrim(p_local_compra), '') is null then
    raise exception 'Informe o fornecedor ou o local da compra';
  end if;

  if p_fornecedor_id is not null
    and not exists (
      select 1 from public.fornecedores
      where id = p_fornecedor_id and ativo = true
    ) then
    raise exception 'Fornecedor inválido ou inativo';
  end if;

  -- Uma repetição da mesma requisição devolve a compra já criada sem duplicar estoque.
  select id into v_compra_id
  from public.mercado_compras
  where criado_por = v_usuario_id
    and idempotency_key = p_idempotency_key;

  if v_compra_id is not null then
    return v_compra_id;
  end if;

  -- Valida todos os itens e calcula o total antes de gravar qualquer alteração.
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    begin
      v_insumo_id := (v_item->>'insumo_id')::uuid;
      v_qtd := (v_item->>'quantidade_comprada')::numeric;
      v_preco := (v_item->>'preco_unitario')::numeric;
    exception when others then
      raise exception 'Item da compra com formato inválido';
    end;

    if v_qtd is null or v_qtd <= 0 then
      raise exception 'Quantidade comprada inválida';
    end if;
    if v_preco is null or v_preco < 0 then
      raise exception 'Preço unitário inválido';
    end if;

    select unidade into v_unidade
    from public.producao_insumos
    where id = v_insumo_id and ativo = true;

    if not found then
      raise exception 'Insumo inválido ou inativo';
    end if;

    v_total := v_total + round(v_qtd * v_preco, 2);
  end loop;

  insert into public.mercado_compras (
    fornecedor_id,
    local_compra,
    data_compra,
    valor_total,
    nota_path,
    observacoes,
    idempotency_key,
    criado_por
  ) values (
    p_fornecedor_id,
    nullif(btrim(p_local_compra), ''),
    p_data_compra,
    v_total,
    p_nota_path,
    p_observacoes,
    p_idempotency_key,
    v_usuario_id
  )
  returning id into v_compra_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_insumo_id := (v_item->>'insumo_id')::uuid;
    v_qtd := (v_item->>'quantidade_comprada')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    v_linha := round(v_qtd * v_preco, 2);

    -- Bloqueia a linha durante a soma para evitar perda de atualização concorrente.
    select unidade into v_unidade
    from public.producao_insumos
    where id = v_insumo_id and ativo = true
    for update;

    if not found then
      raise exception 'Insumo inválido ou inativo';
    end if;

    insert into public.mercado_compra_itens (
      compra_id,
      insumo_id,
      quantidade_comprada,
      unidade,
      preco_unitario,
      preco_total
    ) values (
      v_compra_id,
      v_insumo_id,
      v_qtd,
      v_unidade,
      v_preco,
      v_linha
    );

    update public.producao_insumos
    set estoque_atual = coalesce(estoque_atual, 0) + v_qtd,
        updated_at = now()
    where id = v_insumo_id;

    if not found then
      raise exception 'Falha ao atualizar o estoque do insumo';
    end if;
  end loop;

  return v_compra_id;
end;
$$;

revoke all on function public.registrar_compra_mercado(uuid, date, jsonb, text, text, text, uuid)
  from public, anon;
grant execute on function public.registrar_compra_mercado(uuid, date, jsonb, text, text, text, uuid)
  to authenticated, service_role;

-- O frontend consulta as tabelas, mas toda gravação ocorre exclusivamente pela RPC.
revoke all on public.mercado_compras, public.mercado_compra_itens from anon, authenticated;
grant select on public.mercado_compras, public.mercado_compra_itens
  to authenticated, service_role;
grant all on public.mercado_compras, public.mercado_compra_itens
  to service_role;
