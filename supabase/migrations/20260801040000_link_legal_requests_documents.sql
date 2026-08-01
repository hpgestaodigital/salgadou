-- Vincula documentos juridicos a demandas, preservando o arquivo se a demanda for excluida.

alter table public.documentos_juridicos
  add column if not exists demanda_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documentos_juridicos_demanda_id_fkey'
      and conrelid = 'public.documentos_juridicos'::regclass
  ) then
    alter table public.documentos_juridicos
      add constraint documentos_juridicos_demanda_id_fkey
      foreign key (demanda_id)
      references public.demandas_juridicas(id)
      on delete set null;
  end if;
end $$;

create index if not exists documentos_juridicos_demanda_idx
  on public.documentos_juridicos (demanda_id, created_at desc)
  where demanda_id is not null;

grant select, insert, update, delete on public.documentos_juridicos to authenticated, service_role;
