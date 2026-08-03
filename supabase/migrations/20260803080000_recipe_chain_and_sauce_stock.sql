-- Fichas técnicas em cadeia e estoque de molhos por lote.

create table if not exists public.producao_fichas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null check (categoria in ('salgado','massa','recheio','molho')),
  unidade_rendimento text not null default 'un' check (unidade_rendimento in ('un','g','kg','ml','l')),
  rendimento_padrao numeric(14,4) not null check (rendimento_padrao > 0),
  observacoes text,
  ativo boolean not null default true,
  criado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists producao_fichas_nome_categoria_uq
  on public.producao_fichas_tecnicas (lower(nome), categoria) where ativo;

create table if not exists public.producao_ficha_itens (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.producao_fichas_tecnicas(id) on delete cascade,
  insumo_id uuid references public.producao_insumos(id),
  componente_ficha_id uuid references public.producao_fichas_tecnicas(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  unidade text not null check (unidade in ('un','g','kg','ml','l')),
  created_at timestamptz not null default now(),
  check ((insumo_id is not null)::int + (componente_ficha_id is not null)::int = 1),
  check (ficha_id is distinct from componente_ficha_id)
);

create index if not exists producao_ficha_itens_ficha_idx on public.producao_ficha_itens(ficha_id);

create table if not exists public.producao_molho_lotes (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.producao_fichas_tecnicas(id),
  codigo text not null unique,
  data_producao date not null default current_date,
  receitas_produzidas numeric(14,4) not null check (receitas_produzidas > 0),
  rendimento_esperado numeric(14,4) not null check (rendimento_esperado > 0),
  bisnagas_grandes integer not null default 0 check (bisnagas_grandes >= 0),
  bisnagas_pequenas integer not null default 0 check (bisnagas_pequenas >= 0),
  bisnagas_grandes_disponiveis integer not null default 0 check (bisnagas_grandes_disponiveis >= 0),
  bisnagas_pequenas_disponiveis integer not null default 0 check (bisnagas_pequenas_disponiveis >= 0),
  observacoes text,
  criado_por uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists producao_molho_lotes_ficha_data_idx
  on public.producao_molho_lotes(ficha_id, data_producao desc, created_at desc);

alter table public.producao_fichas_tecnicas enable row level security;
alter table public.producao_ficha_itens enable row level security;
alter table public.producao_molho_lotes enable row level security;

create policy "Acessar fichas tecnicas" on public.producao_fichas_tecnicas
for all to authenticated
using (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'))
with check (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'));

create policy "Acessar itens de fichas" on public.producao_ficha_itens
for all to authenticated
using (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'))
with check (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'));

create policy "Ler lotes de molho" on public.producao_molho_lotes
for select to authenticated
using (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'));

revoke insert, update, delete on public.producao_molho_lotes from authenticated;

create or replace function public.registrar_producao_molho(
  ficha_id_param uuid,
  receitas_param numeric,
  data_param date,
  grandes_param integer,
  pequenas_param integer,
  observacoes_param text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  ficha record;
  item record;
  necessario numeric(14,4);
  saldo numeric(14,4);
  lote_id uuid;
  lote_codigo text;
begin
  if (select auth.uid()) is null or not (
    private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')
  ) then raise exception 'Acesso negado'; end if;

  if receitas_param is null or receitas_param <= 0 then raise exception 'Informe quantas receitas foram produzidas'; end if;
  if coalesce(grandes_param,0) < 0 or coalesce(pequenas_param,0) < 0 then raise exception 'Rendimento inválido'; end if;
  if coalesce(grandes_param,0) + coalesce(pequenas_param,0) <= 0 then raise exception 'Informe ao menos uma bisnaga produzida'; end if;

  select * into ficha from public.producao_fichas_tecnicas
  where id = ficha_id_param and categoria = 'molho' and ativo;
  if not found then raise exception 'Ficha técnica de molho não encontrada'; end if;

  if exists (select 1 from public.producao_ficha_itens where ficha_id=ficha_id_param and componente_ficha_id is not null) then
    raise exception 'A produção direta de molho aceita apenas insumos na ficha técnica';
  end if;
  if not exists (select 1 from public.producao_ficha_itens where ficha_id=ficha_id_param) then
    raise exception 'Cadastre os insumos da ficha técnica antes de produzir';
  end if;

  for item in
    select fi.*, i.nome, i.estoque_atual
    from public.producao_ficha_itens fi
    join public.producao_insumos i on i.id=fi.insumo_id
    where fi.ficha_id=ficha_id_param
    for update of i
  loop
    necessario := item.quantidade * receitas_param;
    saldo := item.estoque_atual;
    if saldo < necessario then
      raise exception 'Saldo insuficiente de %. Necessário: %, disponível: %', item.nome, necessario, saldo;
    end if;

    update public.producao_insumos
      set estoque_atual = saldo - necessario, updated_at = now()
      where id=item.insumo_id;

    insert into public.producao_estoque_movimentacoes(
      insumo_id,tipo,quantidade,saldo_anterior,saldo_posterior,
      origem_tipo,motivo,observacoes,criado_por
    ) values (
      item.insumo_id,'saida',necessario,saldo,saldo-necessario,
      'producao_molho','Produção de ' || ficha.nome,
      nullif(btrim(observacoes_param),''),(select auth.uid())
    );
  end loop;

  lote_codigo := 'MOL-' || to_char(coalesce(data_param,current_date),'YYYYMMDD') || '-' || upper(substr(replace(ficha.nome,' ',''),1,4)) || '-' || substr(gen_random_uuid()::text,1,4);

  insert into public.producao_molho_lotes(
    ficha_id,codigo,data_producao,receitas_produzidas,rendimento_esperado,
    bisnagas_grandes,bisnagas_pequenas,bisnagas_grandes_disponiveis,
    bisnagas_pequenas_disponiveis,observacoes,criado_por
  ) values (
    ficha_id_param,lote_codigo,coalesce(data_param,current_date),receitas_param,
    ficha.rendimento_padrao * receitas_param,coalesce(grandes_param,0),coalesce(pequenas_param,0),
    coalesce(grandes_param,0),coalesce(pequenas_param,0),nullif(btrim(observacoes_param),''),(select auth.uid())
  ) returning id into lote_id;

  return lote_id;
end;
$$;

revoke all on function public.registrar_producao_molho(uuid,numeric,date,integer,integer,text) from public;
grant execute on function public.registrar_producao_molho(uuid,numeric,date,integer,integer,text) to authenticated;
