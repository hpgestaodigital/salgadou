-- Estruturas adicionais do ERP Salgadou.
-- A aplicação continua compatível com os registros existentes.

alter table public.colaboradores
  add column if not exists modalidade_pagamento text,
  add column if not exists periodicidade_pagamento text,
  add column if not exists valor_pagamento numeric(12,2),
  add column if not exists observacoes_contrato text;

update public.colaboradores
set modalidade_pagamento = case
    when tipo = 'Sócio' then 'pro_labore'
    when tipo ilike '%diar%' or tipo ilike '%freelancer%' then 'diaria'
    else 'contrato'
  end,
  periodicidade_pagamento = case
    when tipo = 'Sócio' then 'mensal'
    when tipo ilike '%diar%' or tipo ilike '%freelancer%' then 'por_dia'
    else 'mensal'
  end,
  valor_pagamento = coalesce(valor_pagamento, valor_diaria)
where modalidade_pagamento is null;

create table if not exists public.kanban_tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  contexto text not null check (contexto in ('socios', 'colaboradores')),
  responsavel_id uuid not null references public.colaboradores(id) on delete restrict,
  responsavel_nome text not null,
  status text not null check (status in ('nao_realizado', 'a_fazer', 'em_andamento', 'concluido')),
  prazo date,
  created_at timestamptz not null default now()
);

create index if not exists kanban_tarefas_contexto_status_idx
  on public.kanban_tarefas (contexto, status);
create index if not exists kanban_tarefas_prazo_idx
  on public.kanban_tarefas (prazo);

create table if not exists public.entregas_motoboy (
  id uuid primary key default gen_random_uuid(),
  pagamento_id uuid not null references public.pagamentos_motoboys(id) on delete cascade,
  identificador text,
  numero_entrega text,
  bairro text,
  valor_recebido numeric(12,2),
  comissao numeric(12,2),
  created_at timestamptz not null default now()
);

create index if not exists entregas_motoboy_pagamento_idx
  on public.entregas_motoboy (pagamento_id);

alter table public.kanban_tarefas enable row level security;
alter table public.entregas_motoboy enable row level security;

drop policy if exists "Usuários autenticados gerenciam tarefas" on public.kanban_tarefas;
create policy "Usuários autenticados gerenciam tarefas"
  on public.kanban_tarefas for all to authenticated
  using (true) with check (true);

drop policy if exists "Usuários autenticados gerenciam entregas" on public.entregas_motoboy;
create policy "Usuários autenticados gerenciam entregas"
  on public.entregas_motoboy for all to authenticated
  using (true) with check (true);
