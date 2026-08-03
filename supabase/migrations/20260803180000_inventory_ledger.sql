-- Livro de movimentações do estoque de insumos.
-- Toda alteração futura de saldo passa a deixar um extrato com saldo anterior,
-- quantidade movimentada, saldo posterior, origem, motivo e responsável.

create table if not exists public.producao_estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.producao_insumos(id) on delete restrict,
  tipo text not null check (tipo in (
    'saldo_inicial',
    'entrada_compra',
    'entrada_manual',
    'saida_producao',
    'saida_manual',
    'ajuste_positivo',
    'ajuste_negativo',
    'ajuste_direto',
    'estorno_consumo',
    'estorno',
    'perda'
  )),
  quantidade numeric(14,3) not null check (quantidade <> 0),
  saldo_anterior numeric(14,3) not null,
  saldo_posterior numeric(14,3) not null,
  origem_tipo text,
  origem_id uuid,
  motivo text,
  observacoes text,
  movimento_estornado_id uuid references public.producao_estoque_movimentacoes(id) on delete restrict,
  criado_por uuid,
  created_at timestamptz not null default now(),
  constraint producao_estoque_movimentacoes_saldo_check
    check (saldo_posterior = saldo_anterior + quantidade)
);

create index if not exists producao_estoque_movimentacoes_insumo_data_idx
  on public.producao_estoque_movimentacoes (insumo_id, created_at desc);
create index if not exists producao_estoque_movimentacoes_origem_idx
  on public.producao_estoque_movimentacoes (origem_tipo, origem_id)
  where origem_id is not null;
create unique index if not exists producao_estoque_movimentacoes_estorno_uidx
  on public.producao_estoque_movimentacoes (movimento_estornado_id)
  where movimento_estornado_id is not null;

alter table public.producao_estoque_movimentacoes enable row level security;

drop policy if exists "Estoque consulta movimentacoes" on public.producao_estoque_movimentacoes;
create policy "Estoque consulta movimentacoes"
  on public.producao_estoque_movimentacoes for select to authenticated
  using (
    private.usuario_pode_acessar('producao_estoque')
    or private.usuario_pode_acessar('producao_planejamento')
    or private.usuario_pode_acessar('producao_compras')
  );

revoke all on public.producao_estoque_movimentacoes from public, anon, authenticated;
grant select on public.producao_estoque_movimentacoes to authenticated;
grant select, insert, update, delete on public.producao_estoque_movimentacoes to service_role;

-- O trigger transforma toda mudança de saldo em uma linha de extrato.
-- Alterações diretas legadas recebem o tipo ajuste_direto.
create or replace function private.registrar_movimentacao_estoque_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_anterior numeric(14,3);
  v_posterior numeric(14,3);
  v_delta numeric(14,3);
  v_tipo text;
  v_origem_tipo text;
  v_origem_id uuid;
  v_motivo text;
  v_observacoes text;
  v_estornado_id uuid;
  v_criado_por uuid;
begin
  v_anterior := case when tg_op = 'INSERT' then 0 else old.estoque_atual end;
  v_posterior := new.estoque_atual;
  v_delta := v_posterior - v_anterior;
  if v_delta = 0 then return new; end if;

  v_tipo := nullif(current_setting('app.estoque_tipo', true), '');
  if v_tipo is null then
    v_tipo := case when tg_op = 'INSERT' then 'saldo_inicial' else 'ajuste_direto' end;
  end if;

  v_origem_tipo := nullif(current_setting('app.estoque_origem_tipo', true), '');
  v_origem_id := nullif(current_setting('app.estoque_origem_id', true), '')::uuid;
  v_motivo := nullif(current_setting('app.estoque_motivo', true), '');
  v_observacoes := nullif(current_setting('app.estoque_observacoes', true), '');
  v_estornado_id := nullif(current_setting('app.estoque_movimento_estornado_id', true), '')::uuid;
  v_criado_por := coalesce(
    nullif(current_setting('app.estoque_criado_por', true), '')::uuid,
    (select auth.uid())
  );

  if v_tipo = 'ajuste_direto' and v_motivo is null then
    v_motivo := 'Alteração direta do saldo registrada automaticamente';
  end if;

  insert into public.producao_estoque_movimentacoes (
    insumo_id, tipo, quantidade, saldo_anterior, saldo_posterior,
    origem_tipo, origem_id, motivo, observacoes,
    movimento_estornado_id, criado_por
  ) values (
    new.id, v_tipo, v_delta, v_anterior, v_posterior,
    v_origem_tipo, v_origem_id, v_motivo, v_observacoes,
    v_estornado_id, v_criado_por
  );

  return new;
end;
$$;

revoke all on function private.registrar_movimentacao_estoque_trigger() from public, anon, authenticated;

drop trigger if exists insumo_registra_movimentacao_estoque on public.producao_insumos;
create trigger insumo_registra_movimentacao_estoque
after insert or update of estoque_atual on public.producao_insumos
for each row execute function private.registrar_movimentacao_estoque_trigger();

-- Registra o saldo que já existia antes da implantação do extrato.
insert into public.producao_estoque_movimentacoes (
  insumo_id, tipo, quantidade, saldo_anterior, saldo_posterior,
  origem_tipo, motivo, criado_por, created_at
)
select
  i.id, 'saldo_inicial', i.estoque_atual, 0, i.estoque_atual,
  'migracao', 'Saldo existente na implantação do livro de movimentações',
  null, coalesce(i.created_at, now())
from public.producao_insumos i
where i.estoque_atual <> 0
  and not exists (
    select 1 from public.producao_estoque_movimentacoes m where m.insumo_id = i.id
  );

-- Único ponto interno que altera o saldo. Quantidade positiva entra;
-- quantidade negativa sai. O saldo nunca pode ficar negativo.
create or replace function private.aplicar_movimentacao_estoque(
  p_insumo_id uuid,
  p_quantidade numeric,
  p_tipo text,
  p_origem_tipo text default null,
  p_origem_id uuid default null,
  p_motivo text default null,
  p_observacoes text default null,
  p_movimento_estornado_id uuid default null,
  p_criado_por uuid default null,
  p_exigir_ativo boolean default true
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_saldo numeric(14,3);
  v_novo_saldo numeric(14,3);
begin
  if p_quantidade is null or p_quantidade = 0 then
    raise exception 'Quantidade de movimentação inválida';
  end if;

  select estoque_atual into v_saldo
  from public.producao_insumos
  where id = p_insumo_id and (not p_exigir_ativo or ativo)
  for update;
  if not found then raise exception 'Insumo não encontrado ou inativo'; end if;

  v_novo_saldo := (v_saldo + p_quantidade)::numeric(14,3);
  if v_novo_saldo = v_saldo then
    raise exception 'Quantidade menor que a precisão aceita pelo estoque';
  end if;
  if v_novo_saldo < 0 then
    raise exception 'Estoque insuficiente. Disponível: %, movimentação: %', v_saldo, p_quantidade;
  end if;

  perform set_config('app.estoque_tipo', p_tipo, true);
  perform set_config('app.estoque_origem_tipo', coalesce(p_origem_tipo, ''), true);
  perform set_config('app.estoque_origem_id', coalesce(p_origem_id::text, ''), true);
  perform set_config('app.estoque_motivo', coalesce(p_motivo, ''), true);
  perform set_config('app.estoque_observacoes', coalesce(p_observacoes, ''), true);
  perform set_config('app.estoque_movimento_estornado_id', coalesce(p_movimento_estornado_id::text, ''), true);
  perform set_config('app.estoque_criado_por', coalesce(p_criado_por::text, (select auth.uid())::text, ''), true);

  update public.producao_insumos
  set estoque_atual = v_novo_saldo, updated_at = now()
  where id = p_insumo_id
  returning estoque_atual into v_novo_saldo;

  return v_novo_saldo;
end;
$$;

revoke all on function private.aplicar_movimentacao_estoque(uuid, numeric, text, text, uuid, text, text, uuid, uuid, boolean)
  from public, anon, authenticated;

create or replace function public.registrar_entrada_estoque(
  insumo_id_param uuid,
  quantidade_param numeric,
  motivo_param text,
  observacoes_param text default null
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if (select auth.uid()) is null
    or not private.usuario_pode_acessar('producao_estoque') then
    raise exception 'Acesso negado';
  end if;
  if quantidade_param is null or quantidade_param <= 0 then
    raise exception 'Quantidade de entrada inválida';
  end if;
  if nullif(btrim(motivo_param), '') is null then
    raise exception 'Informe o motivo da entrada';
  end if;

  return private.aplicar_movimentacao_estoque(
    insumo_id_param, quantidade_param, 'entrada_manual', 'entrada_manual', null,
    btrim(motivo_param), observacoes_param, null, (select auth.uid()), true
  );
end;
$$;

create or replace function public.registrar_saida_estoque(
  insumo_id_param uuid,
  quantidade_param numeric,
  motivo_param text,
  observacoes_param text default null
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if (select auth.uid()) is null
    or not private.usuario_pode_acessar('producao_estoque') then
    raise exception 'Acesso negado';
  end if;
  if quantidade_param is null or quantidade_param <= 0 then
    raise exception 'Quantidade de saída inválida';
  end if;
  if nullif(btrim(motivo_param), '') is null then
    raise exception 'Informe o motivo da saída';
  end if;

  return private.aplicar_movimentacao_estoque(
    insumo_id_param, -quantidade_param, 'saida_manual', 'saida_manual', null,
    btrim(motivo_param), observacoes_param, null, (select auth.uid()), true
  );
end;
$$;

create or replace function public.ajustar_estoque_insumo(
  insumo_id_param uuid,
  novo_saldo_param numeric,
  motivo_param text,
  observacoes_param text default null
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_atual numeric(14,3);
  v_delta numeric(14,3);
  v_tipo text;
begin
  if (select auth.uid()) is null
    or not private.usuario_pode_acessar('producao_estoque') then
    raise exception 'Acesso negado';
  end if;
  if novo_saldo_param is null or novo_saldo_param < 0 then
    raise exception 'Novo saldo inválido';
  end if;
  if nullif(btrim(motivo_param), '') is null then
    raise exception 'Informe o motivo do ajuste';
  end if;

  select estoque_atual into v_atual
  from public.producao_insumos
  where id = insumo_id_param and ativo
  for update;
  if not found then raise exception 'Insumo não encontrado ou inativo'; end if;

  v_delta := (novo_saldo_param - v_atual)::numeric(14,3);
  if v_delta = 0 then return v_atual; end if;
  v_tipo := case when v_delta > 0 then 'ajuste_positivo' else 'ajuste_negativo' end;

  return private.aplicar_movimentacao_estoque(
    insumo_id_param, v_delta, v_tipo, 'inventario', null,
    btrim(motivo_param), observacoes_param, null, (select auth.uid()), true
  );
end;
$$;

create or replace function public.estornar_movimentacao_estoque(
  movimentacao_id_param uuid,
  motivo_param text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_movimento public.producao_estoque_movimentacoes%rowtype;
  v_estorno_id uuid;
begin
  if (select auth.uid()) is null
    or not private.usuario_pode_acessar('producao_estoque') then
    raise exception 'Acesso negado';
  end if;
  if nullif(btrim(motivo_param), '') is null then
    raise exception 'Informe o motivo do estorno';
  end if;

  select * into v_movimento
  from public.producao_estoque_movimentacoes
  where id = movimentacao_id_param
  for update;
  if not found then raise exception 'Movimentação não encontrada'; end if;
  if v_movimento.tipo = 'estorno' then raise exception 'Não é permitido estornar um estorno'; end if;
  if exists (
    select 1 from public.producao_estoque_movimentacoes
    where movimento_estornado_id = v_movimento.id
  ) then
    raise exception 'Esta movimentação já foi estornada';
  end if;

  perform private.aplicar_movimentacao_estoque(
    v_movimento.insumo_id,
    -v_movimento.quantidade,
    'estorno',
    'movimentacao_estoque',
    v_movimento.id,
    btrim(motivo_param),
    'Estorno da movimentação ' || v_movimento.id::text,
    v_movimento.id,
    (select auth.uid()),
    false
  );

  select id into v_estorno_id
  from public.producao_estoque_movimentacoes
  where movimento_estornado_id = v_movimento.id;
  return v_estorno_id;
end;
$$;

revoke all on function public.registrar_entrada_estoque(uuid, numeric, text, text) from public, anon;
revoke all on function public.registrar_saida_estoque(uuid, numeric, text, text) from public, anon;
revoke all on function public.ajustar_estoque_insumo(uuid, numeric, text, text) from public, anon;
revoke all on function public.estornar_movimentacao_estoque(uuid, text) from public, anon;
grant execute on function public.registrar_entrada_estoque(uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.registrar_saida_estoque(uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.ajustar_estoque_insumo(uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.estornar_movimentacao_estoque(uuid, text) to authenticated, service_role;

-- Compras do Mercado passam a gerar entrada rastreável.
create or replace function public.registrar_compra_mercado(
  p_fornecedor_id uuid,
  p_data_compra date,
  p_itens jsonb,
  p_observacoes text default null,
  p_nota_path text default null,
  p_local_compra text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_compra_id uuid;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_insumo_id uuid;
  v_qtd numeric(14,4);
  v_preco numeric(12,4);
  v_linha numeric(12,2);
  v_unidade text;
begin
  if v_usuario_id is null
    or not private.usuario_pode_acessar('producao_compras') then
    raise exception 'Acesso negado';
  end if;
  if p_data_compra is null then raise exception 'Data da compra é obrigatória'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'É necessário informar ao menos um item';
  end if;
  if p_fornecedor_id is null and nullif(btrim(p_local_compra), '') is null then
    raise exception 'Informe o fornecedor ou o local da compra';
  end if;
  if p_fornecedor_id is not null and not exists (
    select 1 from public.fornecedores where id = p_fornecedor_id and ativo = true
  ) then
    raise exception 'Fornecedor inválido ou inativo';
  end if;

  select id into v_compra_id
  from public.mercado_compras
  where criado_por = v_usuario_id and idempotency_key = p_idempotency_key;
  if v_compra_id is not null then return v_compra_id; end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    begin
      v_insumo_id := (v_item->>'insumo_id')::uuid;
      v_qtd := (v_item->>'quantidade_comprada')::numeric;
      v_preco := (v_item->>'preco_unitario')::numeric;
    exception when others then
      raise exception 'Item da compra com formato inválido';
    end;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade comprada inválida'; end if;
    if v_preco is null or v_preco < 0 then raise exception 'Preço unitário inválido'; end if;
    select unidade into v_unidade
    from public.producao_insumos
    where id = v_insumo_id and ativo = true;
    if not found then raise exception 'Insumo inválido ou inativo'; end if;
    v_total := v_total + round(v_qtd * v_preco, 2);
  end loop;

  insert into public.mercado_compras (
    fornecedor_id, local_compra, data_compra, valor_total,
    nota_path, observacoes, idempotency_key, criado_por
  ) values (
    p_fornecedor_id, nullif(btrim(p_local_compra), ''), p_data_compra, v_total,
    p_nota_path, p_observacoes, p_idempotency_key, v_usuario_id
  ) returning id into v_compra_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_insumo_id := (v_item->>'insumo_id')::uuid;
    v_qtd := (v_item->>'quantidade_comprada')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    v_linha := round(v_qtd * v_preco, 2);

    select unidade into v_unidade
    from public.producao_insumos
    where id = v_insumo_id and ativo = true
    for update;
    if not found then raise exception 'Insumo inválido ou inativo'; end if;

    insert into public.mercado_compra_itens (
      compra_id, insumo_id, quantidade_comprada, unidade, preco_unitario, preco_total
    ) values (
      v_compra_id, v_insumo_id, v_qtd, v_unidade, v_preco, v_linha
    );

    perform private.aplicar_movimentacao_estoque(
      v_insumo_id, v_qtd, 'entrada_compra', 'mercado_compra', v_compra_id,
      'Compra registrada no Mercado', p_observacoes, null, v_usuario_id, true
    );
  end loop;

  return v_compra_id;
end;
$$;

revoke all on function public.registrar_compra_mercado(uuid, date, jsonb, text, text, text, uuid) from public, anon;
grant execute on function public.registrar_compra_mercado(uuid, date, jsonb, text, text, text, uuid) to authenticated, service_role;

-- Consumo real deixa de esconder falta de estoque.
create or replace function private.baixar_consumo_do_estoque()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_delta_consumo numeric(14,4);
  v_insumo_id uuid;
  v_planejamento_id uuid;
  v_registrado_por uuid;
  v_tipo text;
begin
  v_insumo_id := case when tg_op = 'DELETE' then old.insumo_id else new.insumo_id end;
  v_planejamento_id := case when tg_op = 'DELETE' then old.planejamento_id else new.planejamento_id end;
  v_registrado_por := case when tg_op = 'DELETE' then old.registrado_por else new.registrado_por end;
  v_delta_consumo := case
    when tg_op = 'INSERT' then new.quantidade_utilizada
    when tg_op = 'DELETE' then -old.quantidade_utilizada
    else new.quantidade_utilizada - old.quantidade_utilizada
  end;

  if v_delta_consumo = 0 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_tipo := case when v_delta_consumo > 0 then 'saida_producao' else 'estorno_consumo' end;

  perform private.aplicar_movimentacao_estoque(
    v_insumo_id,
    -v_delta_consumo,
    v_tipo,
    'producao_planejamento',
    v_planejamento_id,
    case when v_delta_consumo > 0
      then 'Consumo registrado na produção'
      else 'Correção ou exclusão de consumo da produção'
    end,
    null,
    null,
    v_registrado_por,
    false
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.baixar_consumo_do_estoque() from public, anon, authenticated;

-- Movimentações também obrigam arquivamento do insumo, preservando o extrato.
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
    union all
    select 1 from public.producao_estoque_movimentacoes where insumo_id = insumo_id_param
  ) into possui_historico;

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
