alter table public.kanban_tarefas
  add column if not exists reuniao_id uuid references public.reunioes(id) on delete cascade,
  add column if not exists reuniao_participante_id uuid references public.colaboradores(id) on delete cascade;

create unique index if not exists kanban_tarefas_reuniao_participante_uidx
  on public.kanban_tarefas (reuniao_id, reuniao_participante_id)
  where reuniao_id is not null and reuniao_participante_id is not null;

create or replace function public.sincronizar_reuniao_com_kanban()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  participante record;
  prazo_reuniao date;
  status_tarefa text;
begin
  if tg_op = 'DELETE' then
    delete from public.kanban_tarefas where reuniao_id = old.id;
    return old;
  end if;

  if new.status = 'cancelada' then
    delete from public.kanban_tarefas where reuniao_id = new.id;
    return new;
  end if;

  prazo_reuniao := (new.inicio at time zone 'America/Sao_Paulo')::date;
  status_tarefa := case when new.status = 'realizada' then 'concluido' else 'nao_realizado' end;

  delete from public.kanban_tarefas tarefa
  where tarefa.reuniao_id = new.id
    and not (tarefa.reuniao_participante_id = any(coalesce(new.participante_ids, array[]::uuid[])));

  for participante in
    select c.id, c.nome, c.tipo
    from public.colaboradores c
    where c.id = any(coalesce(new.participante_ids, array[]::uuid[]))
      and c.ativo = true
  loop
    insert into public.kanban_tarefas (
      titulo,
      descricao,
      contexto,
      responsavel_id,
      responsavel_nome,
      prazo,
      status,
      reuniao_id,
      reuniao_participante_id
    ) values (
      new.titulo,
      coalesce(nullif(btrim(new.pauta), ''), 'Reunião sem pauta informada.'),
      case when participante.tipo = 'Sócio' then 'socios' else 'colaboradores' end,
      participante.id,
      participante.nome,
      prazo_reuniao,
      status_tarefa,
      new.id,
      participante.id
    )
    on conflict (reuniao_id, reuniao_participante_id)
      where reuniao_id is not null and reuniao_participante_id is not null
    do update set
      titulo = excluded.titulo,
      descricao = excluded.descricao,
      contexto = excluded.contexto,
      responsavel_id = excluded.responsavel_id,
      responsavel_nome = excluded.responsavel_nome,
      prazo = excluded.prazo,
      status = excluded.status;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_sincronizar_reuniao_com_kanban on public.reunioes;
create trigger trg_sincronizar_reuniao_com_kanban
after insert or update of titulo, pauta, inicio, status, participante_ids
on public.reunioes
for each row execute function public.sincronizar_reuniao_com_kanban();

drop trigger if exists trg_remover_reuniao_do_kanban on public.reunioes;
create trigger trg_remover_reuniao_do_kanban
after delete on public.reunioes
for each row execute function public.sincronizar_reuniao_com_kanban();

insert into public.kanban_tarefas (
  titulo,
  descricao,
  contexto,
  responsavel_id,
  responsavel_nome,
  prazo,
  status,
  reuniao_id,
  reuniao_participante_id
)
select
  r.titulo,
  coalesce(nullif(btrim(r.pauta), ''), 'Reunião sem pauta informada.'),
  case when c.tipo = 'Sócio' then 'socios' else 'colaboradores' end,
  c.id,
  c.nome,
  (r.inicio at time zone 'America/Sao_Paulo')::date,
  case when r.status = 'realizada' then 'concluido' else 'nao_realizado' end,
  r.id,
  c.id
from public.reunioes r
join public.colaboradores c on c.id = any(coalesce(r.participante_ids, array[]::uuid[]))
where r.status in ('agendada', 'realizada')
  and c.ativo = true
on conflict (reuniao_id, reuniao_participante_id)
  where reuniao_id is not null and reuniao_participante_id is not null
do update set
  titulo = excluded.titulo,
  descricao = excluded.descricao,
  contexto = excluded.contexto,
  responsavel_id = excluded.responsavel_id,
  responsavel_nome = excluded.responsavel_nome,
  prazo = excluded.prazo,
  status = excluded.status;

insert into public.auditoria_acoes (
  tabela,
  registro_id,
  registro_titulo,
  acao,
  usuario_id,
  usuario_nome,
  usuario_email,
  ocorrido_em
)
select
  'kanban_tarefas',
  tarefa.id,
  left(tarefa.titulo, 240),
  'criou',
  reuniao.organizador_id,
  coalesce(
    nullif(usuario.raw_user_meta_data ->> 'nome', ''),
    nullif(usuario.raw_user_meta_data ->> 'name', ''),
    nullif(usuario.email, ''),
    'Organizador da reunião'
  ),
  usuario.email,
  reuniao.created_at
from public.kanban_tarefas tarefa
join public.reunioes reuniao on reuniao.id = tarefa.reuniao_id
left join auth.users usuario on usuario.id = reuniao.organizador_id
where reuniao.organizador_id is not null
  and not exists (
    select 1
    from public.auditoria_acoes auditoria
    where auditoria.tabela = 'kanban_tarefas'
      and auditoria.registro_id = tarefa.id
      and auditoria.acao = 'criou'
  );

notify pgrst, 'reload schema';
