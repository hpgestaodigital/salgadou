-- Mantém itens do backlog de reuniões sincronizados com tarefas do Kanban.
-- A reunião continua sendo a origem do vínculo; alterações operacionais no Kanban
-- retornam para o item correspondente.

alter table public.kanban_tarefas
  add column if not exists reuniao_item_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.kanban_tarefas'::regclass
      and conname = 'kanban_tarefas_reuniao_item_id_fkey'
  ) then
    alter table public.kanban_tarefas
      add constraint kanban_tarefas_reuniao_item_id_fkey
      foreign key (reuniao_item_id)
      references public.reunioes_itens(id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.kanban_tarefas'::regclass
      and conname = 'kanban_tarefas_reuniao_item_id_key'
  ) then
    alter table public.kanban_tarefas
      add constraint kanban_tarefas_reuniao_item_id_key
      unique (reuniao_item_id);
  end if;
end;
$$;

create index if not exists kanban_tarefas_reuniao_item_id_idx
  on public.kanban_tarefas (reuniao_item_id)
  where reuniao_item_id is not null;

create or replace function private.descricao_origem_item_reuniao(
  reuniao_titulo text,
  prioridade text
)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select format(
    'Origem: reunião "%s" · Prioridade: %s',
    coalesce(nullif(trim(reuniao_titulo), ''), 'Sem título'),
    case prioridade
      when 'alta' then 'Alta'
      when 'baixa' then 'Baixa'
      else 'Média'
    end
  );
$function$;

create or replace function private.sincronizar_item_reuniao_no_kanban()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  colaborador_nome text;
  colaborador_tipo text;
  reuniao_titulo text;
  contexto_kanban text;
  descricao_kanban text;
  tarefa_atual public.kanban_tarefas%rowtype;
begin
  -- Sem responsável não existe tarefa individual a exibir no Kanban.
  if new.responsavel_id is null then
    delete from public.kanban_tarefas
    where reuniao_item_id = new.id;
    return new;
  end if;

  select c.nome, c.tipo
    into colaborador_nome, colaborador_tipo
  from public.colaboradores c
  where c.id = new.responsavel_id;

  if not found then
    delete from public.kanban_tarefas
    where reuniao_item_id = new.id;
    return new;
  end if;

  select r.titulo
    into reuniao_titulo
  from public.reunioes r
  where r.id = new.reuniao_id;

  contexto_kanban := case
    when colaborador_tipo = 'Sócio' then 'socios'
    else 'colaboradores'
  end;

  descricao_kanban := private.descricao_origem_item_reuniao(
    reuniao_titulo,
    new.prioridade
  );

  select *
    into tarefa_atual
  from public.kanban_tarefas
  where reuniao_item_id = new.id;

  if not found then
    insert into public.kanban_tarefas (
      titulo,
      descricao,
      contexto,
      responsavel_id,
      responsavel_nome,
      status,
      prazo,
      reuniao_item_id
    ) values (
      new.descricao,
      descricao_kanban,
      contexto_kanban,
      new.responsavel_id,
      colaborador_nome,
      new.status,
      new.prazo,
      new.id
    );
  elsif tarefa_atual.titulo is distinct from new.descricao
     or tarefa_atual.descricao is distinct from descricao_kanban
     or tarefa_atual.contexto is distinct from contexto_kanban
     or tarefa_atual.responsavel_id is distinct from new.responsavel_id
     or tarefa_atual.responsavel_nome is distinct from colaborador_nome
     or tarefa_atual.status is distinct from new.status
     or tarefa_atual.prazo is distinct from new.prazo then
    update public.kanban_tarefas
    set titulo = new.descricao,
        descricao = descricao_kanban,
        contexto = contexto_kanban,
        responsavel_id = new.responsavel_id,
        responsavel_nome = colaborador_nome,
        status = new.status,
        prazo = new.prazo
    where id = tarefa_atual.id;
  end if;

  return new;
end;
$function$;

create or replace function private.sincronizar_kanban_no_item_reuniao()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  status_item text;
begin
  if new.reuniao_item_id is null then
    return new;
  end if;

  status_item := case
    when new.status = 'a_fazer' then 'nao_realizado'
    else new.status
  end;

  update public.reunioes_itens ri
  set descricao = new.titulo,
      responsavel_id = new.responsavel_id,
      responsavel_nome = new.responsavel_nome,
      prazo = new.prazo,
      status = status_item,
      updated_at = now()
  where ri.id = new.reuniao_item_id
    and (
      ri.descricao is distinct from new.titulo
      or ri.responsavel_id is distinct from new.responsavel_id
      or ri.responsavel_nome is distinct from new.responsavel_nome
      or ri.prazo is distinct from new.prazo
      or ri.status is distinct from status_item
    );

  return new;
end;
$function$;

create or replace function private.sincronizar_titulo_reuniao_no_kanban()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  update public.kanban_tarefas kt
  set descricao = private.descricao_origem_item_reuniao(new.titulo, ri.prioridade)
  from public.reunioes_itens ri
  where ri.reuniao_id = new.id
    and kt.reuniao_item_id = ri.id
    and kt.descricao is distinct from private.descricao_origem_item_reuniao(new.titulo, ri.prioridade);

  return new;
end;
$function$;

drop trigger if exists sincronizar_item_reuniao_kanban_insert on public.reunioes_itens;
create trigger sincronizar_item_reuniao_kanban_insert
after insert on public.reunioes_itens
for each row
execute function private.sincronizar_item_reuniao_no_kanban();

drop trigger if exists sincronizar_item_reuniao_kanban_update on public.reunioes_itens;
create trigger sincronizar_item_reuniao_kanban_update
after update of reuniao_id, descricao, responsavel_id, responsavel_nome, prazo, prioridade, status
on public.reunioes_itens
for each row
execute function private.sincronizar_item_reuniao_no_kanban();

drop trigger if exists sincronizar_kanban_item_reuniao_update on public.kanban_tarefas;
create trigger sincronizar_kanban_item_reuniao_update
after update of titulo, responsavel_id, responsavel_nome, status, prazo
on public.kanban_tarefas
for each row
when (new.reuniao_item_id is not null)
execute function private.sincronizar_kanban_no_item_reuniao();

drop trigger if exists sincronizar_titulo_reuniao_kanban on public.reunioes;
create trigger sincronizar_titulo_reuniao_kanban
after update of titulo on public.reunioes
for each row
execute function private.sincronizar_titulo_reuniao_no_kanban();

-- Corrige itens já existentes que possuam responsável selecionado.
insert into public.kanban_tarefas (
  titulo,
  descricao,
  contexto,
  responsavel_id,
  responsavel_nome,
  status,
  prazo,
  reuniao_item_id
)
select
  ri.descricao,
  private.descricao_origem_item_reuniao(r.titulo, ri.prioridade),
  case when c.tipo = 'Sócio' then 'socios' else 'colaboradores' end,
  c.id,
  c.nome,
  ri.status,
  ri.prazo,
  ri.id
from public.reunioes_itens ri
join public.reunioes r on r.id = ri.reuniao_id
join public.colaboradores c on c.id = ri.responsavel_id
where ri.responsavel_id is not null
on conflict (reuniao_item_id) do update
set titulo = excluded.titulo,
    descricao = excluded.descricao,
    contexto = excluded.contexto,
    responsavel_id = excluded.responsavel_id,
    responsavel_nome = excluded.responsavel_nome,
    status = excluded.status,
    prazo = excluded.prazo;

notify pgrst, 'reload schema';
