-- Módulo Mercado: registro de compras realizadas.
-- Depende de: producao_insumos, fornecedores, private.usuario_pode_acessar.
-- Amplia o bucket erp-payment-attachments para aceitar PDF.

-- ─── 1. Ampliar bucket para aceitar PDF e aumentar limite ───────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-payment-attachments',
  'erp-payment-attachments',
  false,
  10485760, -- 10 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update set
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─── 2. Tabela: cabeçalho da compra ─────────────────────────────────────────
create table if not exists public.mercado_compras (
  id            uuid primary key default gen_random_uuid(),
  fornecedor_id uuid references public.fornecedores(id) on delete restrict,
  data_compra   date not null,
  valor_total   numeric(12,2) not null default 0 check (valor_total >= 0),
  nota_path     text,   -- path privado no bucket erp-payment-attachments
  observacoes   text,
  criado_por    uuid references auth.users(id) on delete restrict,
  created_at    timestamptz not null default now()
);

create index if not exists mercado_compras_data_idx
  on public.mercado_compras (data_compra desc);
create index if not exists mercado_compras_fornecedor_idx
  on public.mercado_compras (fornecedor_id);

-- ─── 3. Tabela: itens da compra ──────────────────────────────────────────────
create table if not exists public.mercado_compra_itens (
  id                 uuid primary key default gen_random_uuid(),
  compra_id          uuid not null references public.mercado_compras(id) on delete cascade,
  insumo_id          uuid not null references public.producao_insumos(id) on delete restrict,
  quantidade_comprada numeric(14,4) not null check (quantidade_comprada > 0),
  preco_unitario     numeric(12,4) not null check (preco_unitario >= 0),
  preco_total        numeric(12,2) not null check (preco_total >= 0)
);

create index if not exists mercado_compra_itens_compra_idx
  on public.mercado_compra_itens (compra_id);
create index if not exists mercado_compra_itens_insumo_idx
  on public.mercado_compra_itens (insumo_id);

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
alter table public.mercado_compras       enable row level security;
alter table public.mercado_compra_itens  enable row level security;

drop policy if exists "Permissão de módulo mercado_compras"       on public.mercado_compras;
drop policy if exists "Permissão de módulo mercado_compra_itens"  on public.mercado_compra_itens;

create policy "Permissão de módulo mercado_compras"
  on public.mercado_compras for all to authenticated
  using (private.usuario_pode_acessar('producao_compras'))
  with check (private.usuario_pode_acessar('producao_compras'));

create policy "Permissão de módulo mercado_compra_itens"
  on public.mercado_compra_itens for all to authenticated
  using (private.usuario_pode_acessar('producao_compras'))
  with check (private.usuario_pode_acessar('producao_compras'));

-- ─── 5. Policy de storage para a pasta purchases/ ────────────────────────────
-- Leitura: qualquer usuário com acesso a producao_compras (URL assinada)
drop policy if exists "Mercado le notas de compra" on storage.objects;
create policy "Mercado le notas de compra" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'erp-payment-attachments'
    and (storage.foldername(name))[1] = 'purchases'
    and private.usuario_pode_acessar('producao_compras')
  );

-- Envio: o próprio usuário, pasta purchases/{uid}/
drop policy if exists "Mercado envia nota de compra" on storage.objects;
create policy "Mercado envia nota de compra" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'erp-payment-attachments'
    and (storage.foldername(name))[1] = 'purchases'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.usuario_pode_acessar('producao_compras')
  );

-- Remoção: o próprio usuário pode excluir arquivos que enviou
drop policy if exists "Mercado remove nota de compra" on storage.objects;
create policy "Mercado remove nota de compra" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'erp-payment-attachments'
    and (storage.foldername(name))[1] = 'purchases'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and private.usuario_pode_acessar('producao_compras')
  );

-- ─── 6. RPC transacional ─────────────────────────────────────────────────────
-- Registra cabeçalho + itens + atualiza estoque em uma única transação.
-- O trigger estoque_recalcula_compras (em producao_insumos) dispara
-- automaticamente após o UPDATE e reconcilia as compras automáticas pendentes.
create or replace function public.registrar_compra_mercado(
  p_fornecedor_id  uuid,
  p_data_compra    date,
  p_itens          jsonb,  -- [{insumo_id, quantidade_comprada, preco_unitario}]
  p_observacoes    text    default null,
  p_nota_path      text    default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_compra_id  uuid;
  v_total      numeric(12,2) := 0;
  v_item       jsonb;
  v_insumo_id  uuid;
  v_qtd        numeric(14,4);
  v_preco      numeric(12,4);
  v_linha      numeric(12,2);
begin
  -- Validações básicas
  if p_data_compra is null then
    raise exception 'data_compra é obrigatória';
  end if;
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'É necessário ao menos um item na compra';
  end if;

  -- Pré-calcula total
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_qtd   := (v_item->>'quantidade_comprada')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    if v_qtd   is null or v_qtd   <= 0 then raise exception 'quantidade_comprada inválida'; end if;
    if v_preco is null or v_preco <  0 then raise exception 'preco_unitario inválido';      end if;
    v_total := v_total + round(v_qtd * v_preco, 2);
  end loop;

  -- Insere cabeçalho
  insert into public.mercado_compras (
    fornecedor_id, data_compra, valor_total, nota_path, observacoes, criado_por
  ) values (
    p_fornecedor_id, p_data_compra, v_total, p_nota_path, p_observacoes,
    (select auth.uid())
  )
  returning id into v_compra_id;

  -- Insere itens e atualiza estoque
  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_insumo_id := (v_item->>'insumo_id')::uuid;
    v_qtd       := (v_item->>'quantidade_comprada')::numeric;
    v_preco     := (v_item->>'preco_unitario')::numeric;
    v_linha     := round(v_qtd * v_preco, 2);

    insert into public.mercado_compra_itens (
      compra_id, insumo_id, quantidade_comprada, preco_unitario, preco_total
    ) values (
      v_compra_id, v_insumo_id, v_qtd, v_preco, v_linha
    );

    -- Atualiza estoque — mesmo padrão de private.baixar_consumo_do_estoque()
    update public.producao_insumos
    set estoque_atual = estoque_atual + v_qtd,
        updated_at    = now()
    where id = v_insumo_id;
  end loop;

  return v_compra_id;
end;
$$;

-- Apenas usuários com acesso ao módulo podem chamar a RPC
revoke all on function public.registrar_compra_mercado(uuid, date, jsonb, text, text)
  from public, anon;
grant execute on function public.registrar_compra_mercado(uuid, date, jsonb, text, text)
  to authenticated, service_role;

-- ─── 7. Grants nas novas tabelas ─────────────────────────────────────────────
revoke all on public.mercado_compras, public.mercado_compra_itens from anon;
grant select, insert, update, delete
  on public.mercado_compras, public.mercado_compra_itens
  to authenticated, service_role;
