alter table public.reunioes
  add column if not exists transcricao text,
  add column if not exists transcricao_fonte text;

comment on column public.reunioes.transcricao is
  'Transcrição original colada manualmente pelo usuário; não é capturada pelo sistema.';
comment on column public.reunioes.transcricao_fonte is
  'Nome opcional do aplicativo ou origem externa da transcrição.';
