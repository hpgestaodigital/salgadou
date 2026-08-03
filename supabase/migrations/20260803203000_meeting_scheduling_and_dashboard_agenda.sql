-- Transforma o cadastro de atas em um ciclo completo de agendamento e realização.

alter table public.reunioes
  add column if not exists fim timestamptz,
  add column if not exists status text,
  add column if not exists pauta text,
  add column if not exists local text,
  add column if not exists link text,
  add column if not exists organizador_id uuid references auth.users(id),
  add column if not exists realizada_em timestamptz,
  add column if not exists cancelada_em timestamptz,
  add column if not exists motivo_cancelamento text;

update public.reunioes
set status = case
  when inicio >= now() and resumo is null and transcricao is null then 'agendada'
  else 'realizada'
end
where status is null;

update public.reunioes
set fim = inicio + interval '1 hour'
where fim is null;

alter table public.reunioes
  alter column status set default 'agendada',
  alter column status set not null;

alter table public.reunioes
  drop constraint if exists reunioes_status_check,
  add constraint reunioes_status_check
    check (status in ('agendada', 'realizada', 'cancelada'));

alter table public.reunioes
  drop constraint if exists reunioes_fim_apos_inicio_check,
  add constraint reunioes_fim_apos_inicio_check
    check (fim is null or fim > inicio);

create index if not exists reunioes_status_inicio_idx
  on public.reunioes (status, inicio);

create index if not exists reunioes_participante_ids_gin_idx
  on public.reunioes using gin (participante_ids);

create index if not exists reunioes_organizador_inicio_idx
  on public.reunioes (organizador_id, inicio);

create or replace function private.sincronizar_status_reuniao()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  if new.organizador_id is null and tg_op = 'INSERT' then
    new.organizador_id := auth.uid();
  end if;

  if new.status = 'realizada' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.realizada_em := coalesce(new.realizada_em, now());
    new.cancelada_em := null;
    new.motivo_cancelamento := null;
  elsif new.status = 'cancelada' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.cancelada_em := coalesce(new.cancelada_em, now());
  elsif new.status = 'agendada' then
    new.realizada_em := null;
    new.cancelada_em := null;
    new.motivo_cancelamento := null;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists sincronizar_status_reuniao_trigger on public.reunioes;
create trigger sincronizar_status_reuniao_trigger
before insert or update on public.reunioes
for each row execute function private.sincronizar_status_reuniao();

-- Retorna apenas os dados de agenda das reuniões em que o usuário atual está envolvido.
-- A função não libera atas, transcrições nem backlog para quem não possui o módulo Reuniões.
create or replace function public.listar_agenda_reunioes_dashboard(
  data_inicio_param date,
  data_fim_param date
)
returns table (
  id uuid,
  titulo text,
  inicio timestamptz,
  fim timestamptz,
  local text,
  link text,
  participante_nomes text[]
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  select
    r.id,
    r.titulo,
    r.inicio,
    r.fim,
    r.local,
    r.link,
    r.participante_nomes
  from public.reunioes r
  where auth.uid() is not null
    and r.status = 'agendada'
    and (r.inicio at time zone 'America/Sao_Paulo')::date
      between data_inicio_param and data_fim_param
    and (
      r.organizador_id = auth.uid()
      or exists (
        select 1
        from public.usuarios_vinculos uv
        where uv.usuario_id = auth.uid()
          and uv.colaborador_id = any(r.participante_ids)
      )
    )
  order by r.inicio, r.titulo;
$function$;

revoke all on function public.listar_agenda_reunioes_dashboard(date, date) from public;
revoke all on function public.listar_agenda_reunioes_dashboard(date, date) from anon;
grant execute on function public.listar_agenda_reunioes_dashboard(date, date) to authenticated;

notify pgrst, 'reload schema';
