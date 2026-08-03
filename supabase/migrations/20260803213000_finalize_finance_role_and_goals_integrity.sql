-- Perfil Financeiro: aplica privilégio mínimo sem impedir a operação financeira.
update public.perfis_permissoes
set pode_visualizar = false
where papel = 'financeiro';

update public.perfis_permissoes
set pode_visualizar = true
where papel = 'financeiro'
  and modulo in (
    'dashboard',
    'dashboard_calendario_producao',
    'dashboard_fornecedores',
    'dashboard_motoboys',
    'dashboard_resumo_financeiro',
    'financeiro',
    'pagamentos_fornecedores',
    'pagamentos_motoboys'
  );

-- Metas: mantém leitura geral para a barra da Dashboard, mas gestão e histórico
-- obedecem à permissão configurável do módulo Metas.
drop policy if exists "Liderança cria metas" on public.metas;
drop policy if exists "Liderança atualiza metas" on public.metas;
drop policy if exists "Liderança exclui metas" on public.metas;
drop policy if exists "Equipe consulta lançamentos de metas" on public.meta_lancamentos;

create policy "Autorizados criam metas"
on public.metas for insert to authenticated
with check (
  private.usuario_pode_acessar('metas')
  and criado_por = (select auth.uid())
);

create policy "Autorizados atualizam metas"
on public.metas for update to authenticated
using (private.usuario_pode_acessar('metas'))
with check (private.usuario_pode_acessar('metas'));

create policy "Autorizados excluem metas"
on public.metas for delete to authenticated
using (private.usuario_pode_acessar('metas'));

create policy "Autorizados consultam histórico de metas"
on public.meta_lancamentos for select to authenticated
using (private.usuario_pode_acessar('metas'));

-- Toda meta nova começa em zero. O acumulado posterior é alterado apenas pela RPC
-- registrar_lancamento_meta, que mantém o histórico e o total sincronizados.
create or replace function private.normalizar_nova_meta()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
begin
  new.valor_atual := 0;
  new.criado_por := auth.uid();
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists normalizar_nova_meta_trigger on public.metas;
create trigger normalizar_nova_meta_trigger
before insert on public.metas
for each row execute function private.normalizar_nova_meta();

-- Vincula o login pessoal ao cadastro homônimo, sem depender de UUID gerado.
insert into public.usuarios_vinculos (usuario_id, colaborador_id)
select u.id, c.id
from auth.users u
join public.colaboradores c on lower(btrim(c.nome)) = lower('Henrique Polite')
where lower(u.email) = lower('henriquepolite@live.com')
  and not exists (
    select 1 from public.usuarios_vinculos uv where uv.usuario_id = u.id
  )
  and not exists (
    select 1 from public.usuarios_vinculos uv where uv.colaborador_id = c.id
  );

notify pgrst, 'reload schema';
