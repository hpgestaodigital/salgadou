-- Separa a operação de molhos da ficha técnica e permite saídas fracionadas.
-- Também cria pendências estruturadas para receitas com medidas ainda não padronizadas.

-- A view depende das colunas de estoque; precisa ser recriada após a alteração de tipo.
drop view if exists public.producao_estoque_molhos;

alter table public.producao_molho_lotes
  alter column bisnagas_grandes type numeric(14,3) using bisnagas_grandes::numeric,
  alter column bisnagas_pequenas type numeric(14,3) using bisnagas_pequenas::numeric,
  alter column bisnagas_grandes_disponiveis type numeric(14,3) using bisnagas_grandes_disponiveis::numeric,
  alter column bisnagas_pequenas_disponiveis type numeric(14,3) using bisnagas_pequenas_disponiveis::numeric;

alter table public.producao_molho_lotes
  alter column bisnagas_grandes set default 0,
  alter column bisnagas_pequenas set default 0,
  alter column bisnagas_grandes_disponiveis set default 0,
  alter column bisnagas_pequenas_disponiveis set default 0;

alter table public.producao_molho_movimentacoes
  alter column quantidade type numeric(14,3) using quantidade::numeric,
  alter column saldo_anterior type numeric(14,3) using saldo_anterior::numeric,
  alter column saldo_posterior type numeric(14,3) using saldo_posterior::numeric;

create view public.producao_estoque_molhos
with (security_invoker = true)
as
select
  f.id as ficha_id,
  f.nome,
  coalesce(sum(l.bisnagas_grandes_disponiveis), 0::numeric)::numeric(14,3) as grandes_disponiveis,
  coalesce(sum(l.bisnagas_pequenas_disponiveis), 0::numeric)::numeric(14,3) as pequenas_disponiveis,
  max(l.data_producao) as ultima_producao
from public.producao_fichas_tecnicas f
left join public.producao_molho_lotes l on l.ficha_id = f.id
where f.categoria = 'molho' and f.ativo
group by f.id, f.nome;

grant select on public.producao_estoque_molhos to authenticated;
revoke all on public.producao_estoque_molhos from anon;

-- Remove a assinatura antiga para não criar sobrecarga ambígua no PostgREST.
drop function if exists public.registrar_saida_molho(uuid, text, integer, text, date, text);

create or replace function public.registrar_saida_molho(
  ficha_id_param uuid,
  tamanho_param text,
  quantidade_param numeric,
  motivo_param text,
  data_param date default current_date,
  observacoes_param text default null
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  lote record;
  restante numeric(14,3) := round(quantidade_param, 3);
  disponivel numeric(14,3);
  retirar numeric(14,3);
begin
  if auth.uid() is null or not (
    private.usuario_pode_acessar('producao_estoque')
    or private.usuario_pode_acessar('producao_planejamento')
  ) then
    raise exception 'Acesso negado';
  end if;

  if tamanho_param not in ('grande', 'pequena') then
    raise exception 'Bisnaga inválida';
  end if;

  if quantidade_param is null or quantidade_param <= 0 then
    raise exception 'Quantidade inválida';
  end if;

  for lote in
    select *
    from public.producao_molho_lotes
    where ficha_id = ficha_id_param
      and case
        when tamanho_param = 'grande' then bisnagas_grandes_disponiveis
        else bisnagas_pequenas_disponiveis
      end > 0
    order by data_producao, created_at
    for update
  loop
    exit when restante <= 0;

    disponivel := case
      when tamanho_param = 'grande' then lote.bisnagas_grandes_disponiveis
      else lote.bisnagas_pequenas_disponiveis
    end;
    retirar := least(restante, disponivel);

    if tamanho_param = 'grande' then
      update public.producao_molho_lotes
      set bisnagas_grandes_disponiveis = bisnagas_grandes_disponiveis - retirar
      where id = lote.id;
    else
      update public.producao_molho_lotes
      set bisnagas_pequenas_disponiveis = bisnagas_pequenas_disponiveis - retirar
      where id = lote.id;
    end if;

    insert into public.producao_molho_movimentacoes(
      ficha_id, lote_id, tamanho, tipo, quantidade,
      saldo_anterior, saldo_posterior, motivo,
      data_movimentacao, observacoes, criado_por
    ) values (
      ficha_id_param, lote.id, tamanho_param, 'saida', retirar,
      disponivel, disponivel - retirar,
      coalesce(nullif(btrim(motivo_param), ''), 'Saída manual'),
      coalesce(data_param, current_date),
      nullif(btrim(observacoes_param), ''),
      auth.uid()
    );

    restante := restante - retirar;
  end loop;

  if restante > 0 then
    raise exception 'Estoque insuficiente de bisnagas %. Faltam %', tamanho_param, restante;
  end if;
end;
$function$;

revoke all on function public.registrar_saida_molho(uuid, text, numeric, text, date, text) from public, anon;
grant execute on function public.registrar_saida_molho(uuid, text, numeric, text, date, text) to authenticated;

create table if not exists public.producao_ficha_medidas_pendentes (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.producao_fichas_tecnicas(id) on delete cascade,
  item_id uuid references public.producao_ficha_itens(id) on delete set null,
  descricao text not null,
  medida_original text not null,
  quantidade_original numeric(14,4),
  resolvida boolean not null default false,
  quantidade_padronizada numeric(14,4),
  unidade_padronizada text,
  observacoes_resolucao text,
  resolvida_em timestamptz,
  resolvida_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint producao_ficha_medidas_pendentes_descricao_unica unique (ficha_id, descricao),
  constraint producao_ficha_medidas_pendentes_quantidade_check
    check (quantidade_padronizada is null or quantidade_padronizada > 0),
  constraint producao_ficha_medidas_pendentes_unidade_check
    check (unidade_padronizada is null or unidade_padronizada in ('un', 'g', 'kg', 'ml', 'l')),
  constraint producao_ficha_medidas_pendentes_resolucao_check
    check (
      not resolvida
      or (
        quantidade_padronizada is not null
        and unidade_padronizada is not null
        and resolvida_em is not null
      )
    )
);

create index if not exists producao_ficha_medidas_pendentes_ficha_idx
  on public.producao_ficha_medidas_pendentes(ficha_id, resolvida);
create index if not exists producao_ficha_medidas_pendentes_item_idx
  on public.producao_ficha_medidas_pendentes(item_id)
  where item_id is not null;

alter table public.producao_ficha_medidas_pendentes enable row level security;

drop policy if exists "Produção consulta medidas pendentes" on public.producao_ficha_medidas_pendentes;
create policy "Produção consulta medidas pendentes"
on public.producao_ficha_medidas_pendentes
for select
to authenticated
using (
  private.usuario_pode_acessar('producao_estoque')
  or private.usuario_pode_acessar('producao_planejamento')
);

revoke all on public.producao_ficha_medidas_pendentes from anon;
revoke insert, update, delete on public.producao_ficha_medidas_pendentes from authenticated;
grant select on public.producao_ficha_medidas_pendentes to authenticated;

-- Pendências conhecidas dos rascunhos antigos.
insert into public.producao_ficha_medidas_pendentes(
  ficha_id, item_id, descricao, medida_original, quantidade_original
)
select f.id, fi.id, 'Converter o caldo de galinha medido em colheres', 'colher', fi.quantidade
from public.producao_fichas_tecnicas f
join public.producao_ficha_itens fi on fi.ficha_id = f.id
join public.producao_insumos i on i.id = fi.insumo_id
where f.nome = 'Bechamel da Coxinha' and i.nome = 'Caldo de galinha - colher'
on conflict (ficha_id, descricao) do nothing;

insert into public.producao_ficha_medidas_pendentes(
  ficha_id, item_id, descricao, medida_original, quantidade_original
)
select f.id, fi.id, 'Converter a essência de baunilha medida sem unidade padronizada', 'medida', fi.quantidade
from public.producao_fichas_tecnicas f
join public.producao_ficha_itens fi on fi.ficha_id = f.id
join public.producao_insumos i on i.id = fi.insumo_id
where f.nome = 'Massa de Churros' and i.nome = 'Essência de baunilha - medida'
on conflict (ficha_id, descricao) do nothing;

insert into public.producao_ficha_medidas_pendentes(
  ficha_id, item_id, descricao, medida_original, quantidade_original
)
select f.id, fi.id, 'Converter os gomos de calabresa para uma medida padronizada', 'gomo', fi.quantidade
from public.producao_fichas_tecnicas f
join public.producao_ficha_itens fi on fi.ficha_id = f.id
join public.producao_insumos i on i.id = fi.insumo_id
where f.nome = 'Recheio de Calabresa' and i.nome = 'Calabresa - gomo'
on conflict (ficha_id, descricao) do nothing;

insert into public.producao_ficha_medidas_pendentes(
  ficha_id, item_id, descricao, medida_original, quantidade_original
)
select f.id, fi.id, 'Medir a quantidade de orégano usada na receita', 'a gosto', null
from public.producao_fichas_tecnicas f
join public.producao_ficha_itens fi on fi.ficha_id = f.id
join public.producao_insumos i on i.id = fi.insumo_id
where f.nome in ('Recheio de Calabresa', 'Recheio de Pizza') and i.nome = 'Orégano'
on conflict (ficha_id, descricao) do nothing;

insert into public.producao_ficha_medidas_pendentes(
  ficha_id, item_id, descricao, medida_original, quantidade_original
)
select f.id, fi.id, 'Medir a quantidade real de alho usada na receita', 'sem medida confirmada', null
from public.producao_fichas_tecnicas f
join public.producao_ficha_itens fi on fi.ficha_id = f.id
join public.producao_insumos i on i.id = fi.insumo_id
where f.nome = 'Recheio de Kibe' and i.nome = 'Alho pronto triturado'
on conflict (ficha_id, descricao) do nothing;

insert into public.producao_ficha_medidas_pendentes(
  ficha_id, item_id, descricao, medida_original, quantidade_original
)
select f.id, fi.id, 'Medir a quantidade real de hortelã usada na receita', 'sem medida confirmada', null
from public.producao_fichas_tecnicas f
join public.producao_ficha_itens fi on fi.ficha_id = f.id
join public.producao_insumos i on i.id = fi.insumo_id
where f.nome = 'Recheio de Kibe' and i.nome = 'Hortelã triturada'
on conflict (ficha_id, descricao) do nothing;

insert into public.producao_ficha_medidas_pendentes(
  ficha_id, item_id, descricao, medida_original, quantidade_original
)
select f.id, null, 'Padronizar o volume indicado como copo azul', 'copo azul', null
from public.producao_fichas_tecnicas f
where f.nome = 'Recheio de Risoli'
on conflict (ficha_id, descricao) do nothing;

insert into public.producao_ficha_medidas_pendentes(
  ficha_id, item_id, descricao, medida_original, quantidade_original
)
select f.id, null, 'Confirmar o ingrediente descrito no rascunho como 5 kg de churros', '5 kg no rascunho', 5
from public.producao_fichas_tecnicas f
where f.nome = 'Massa de Churros'
on conflict (ficha_id, descricao) do nothing;

update public.producao_fichas_tecnicas
set observacoes = 'Queijo e presunto já foram padronizados em kg. Ainda é necessário medir os gomos de calabresa e o orégano usados na receita.',
    updated_at = now()
where nome = 'Recheio de Calabresa';

update public.producao_fichas_tecnicas
set observacoes = 'Queijo e presunto já foram padronizados em kg. Ainda é necessário medir o orégano usado na receita.',
    updated_at = now()
where nome = 'Recheio de Pizza';

create or replace function private.bloquear_edicao_com_medida_pendente()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  ficha_alvo uuid;
  alteracao_conteudo boolean := true;
begin
  if current_setting('app.resolvendo_medidas_ficha', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'producao_fichas_tecnicas' then
    ficha_alvo := coalesce(new.id, old.id);
    alteracao_conteudo :=
      new.nome is distinct from old.nome
      or new.categoria is distinct from old.categoria
      or new.unidade_rendimento is distinct from old.unidade_rendimento
      or new.rendimento_padrao is distinct from old.rendimento_padrao
      or new.capacidade_unidades_aprox is distinct from old.capacidade_unidades_aprox
      or new.modo_preparo is distinct from old.modo_preparo
      or new.observacoes is distinct from old.observacoes
      or new.rendimento_confirmado is distinct from old.rendimento_confirmado
      or new.revisao_pendente is distinct from old.revisao_pendente;
  else
    ficha_alvo := coalesce(new.ficha_id, old.ficha_id);
  end if;

  if alteracao_conteudo and exists (
    select 1
    from public.producao_ficha_medidas_pendentes p
    where p.ficha_id = ficha_alvo and not p.resolvida
  ) then
    raise exception 'Esta ficha possui medidas obrigatórias pendentes. Abra a edição da ficha e padronize todas as medidas antes de alterá-la.';
  end if;

  return coalesce(new, old);
end;
$function$;

revoke all on function private.bloquear_edicao_com_medida_pendente() from public, anon, authenticated;

drop trigger if exists bloquear_ficha_com_medida_pendente on public.producao_fichas_tecnicas;
create trigger bloquear_ficha_com_medida_pendente
before update on public.producao_fichas_tecnicas
for each row execute function private.bloquear_edicao_com_medida_pendente();

drop trigger if exists bloquear_item_com_medida_pendente on public.producao_ficha_itens;
create trigger bloquear_item_com_medida_pendente
before insert or update or delete on public.producao_ficha_itens
for each row execute function private.bloquear_edicao_com_medida_pendente();

create or replace function public.atualizar_ficha_tecnica_com_medidas(
  ficha_id_param uuid,
  nome_param text,
  categoria_param text,
  rendimento_param numeric,
  unidade_param text,
  capacidade_param numeric,
  modo_preparo_param text,
  observacoes_param text,
  rendimento_confirmado_param boolean,
  revisao_pendente_param boolean,
  medidas_param jsonb
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  ficha public.producao_fichas_tecnicas%rowtype;
  pendencia record;
  resolucao jsonb;
  quantidade_resolvida numeric(14,4);
  unidade_resolvida text;
begin
  if auth.uid() is null or not (
    private.usuario_pode_acessar('producao_estoque')
    or private.usuario_pode_acessar('producao_planejamento')
  ) then
    raise exception 'Acesso negado';
  end if;

  if nullif(btrim(nome_param), '') is null then raise exception 'Informe o nome da ficha'; end if;
  if categoria_param not in ('salgado', 'massa', 'recheio', 'molho') then raise exception 'Categoria inválida'; end if;
  if rendimento_param is null or rendimento_param <= 0 then raise exception 'Rendimento inválido'; end if;
  if unidade_param not in ('un', 'g', 'kg', 'ml', 'l') then raise exception 'Unidade inválida'; end if;
  if jsonb_typeof(coalesce(medidas_param, '[]'::jsonb)) <> 'array' then raise exception 'Medidas inválidas'; end if;

  select * into ficha
  from public.producao_fichas_tecnicas
  where id = ficha_id_param
  for update;

  if not found then raise exception 'Ficha não encontrada'; end if;

  perform set_config('app.resolvendo_medidas_ficha', 'on', true);

  for pendencia in
    select *
    from public.producao_ficha_medidas_pendentes
    where ficha_id = ficha_id_param and not resolvida
    order by created_at, id
    for update
  loop
    select elemento into resolucao
    from jsonb_array_elements(coalesce(medidas_param, '[]'::jsonb)) elemento
    where elemento ->> 'id' = pendencia.id::text
    limit 1;

    if resolucao is null then
      raise exception 'Preencha a medida obrigatória: %', pendencia.descricao;
    end if;

    begin
      quantidade_resolvida := nullif(resolucao ->> 'quantidade', '')::numeric;
    exception when others then
      raise exception 'Quantidade inválida para: %', pendencia.descricao;
    end;
    unidade_resolvida := nullif(btrim(resolucao ->> 'unidade'), '');

    if quantidade_resolvida is null or quantidade_resolvida <= 0 then
      raise exception 'Informe uma quantidade maior que zero para: %', pendencia.descricao;
    end if;
    if unidade_resolvida not in ('un', 'g', 'kg', 'ml', 'l') then
      raise exception 'Escolha a unidade padronizada para: %', pendencia.descricao;
    end if;

    update public.producao_ficha_medidas_pendentes
    set resolvida = true,
        quantidade_padronizada = quantidade_resolvida,
        unidade_padronizada = unidade_resolvida,
        observacoes_resolucao = nullif(btrim(resolucao ->> 'observacoes'), ''),
        resolvida_em = now(),
        resolvida_por = auth.uid()
    where id = pendencia.id;

    if pendencia.item_id is not null then
      update public.producao_ficha_itens
      set quantidade = quantidade_resolvida,
          unidade = unidade_resolvida
      where id = pendencia.item_id;
    end if;
  end loop;

  if exists (
    select 1 from public.producao_ficha_medidas_pendentes
    where ficha_id = ficha_id_param and not resolvida
  ) then
    raise exception 'Ainda existem medidas obrigatórias pendentes nesta ficha';
  end if;

  insert into public.producao_ficha_revisoes(
    ficha_id, acao, versao, dados_anteriores, criado_por
  ) values (
    ficha.id, 'edicao', ficha.versao, to_jsonb(ficha), auth.uid()
  );

  update public.producao_fichas_tecnicas
  set nome = btrim(nome_param),
      categoria = categoria_param,
      rendimento_padrao = rendimento_param,
      unidade_rendimento = unidade_param,
      capacidade_unidades_aprox = case when capacidade_param > 0 then capacidade_param else null end,
      modo_preparo = nullif(btrim(modo_preparo_param), ''),
      observacoes = nullif(btrim(observacoes_param), ''),
      rendimento_confirmado = coalesce(rendimento_confirmado_param, false),
      revisao_pendente = coalesce(revisao_pendente_param, false),
      versao = versao + 1,
      updated_at = now()
  where id = ficha.id;
end;
$function$;

revoke all on function public.atualizar_ficha_tecnica_com_medidas(uuid, text, text, numeric, text, numeric, text, text, boolean, boolean, jsonb) from public, anon;
grant execute on function public.atualizar_ficha_tecnica_com_medidas(uuid, text, text, numeric, text, numeric, text, text, boolean, boolean, jsonb) to authenticated;
