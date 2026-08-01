-- Passa a identificar ações pelo nome do usuário, sem exibir e-mail como nome.
-- Deve ser aplicada depois de 20260801050000_audit_trail.sql.

create or replace function private.registrar_auditoria_erp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dados jsonb;
  ator_id uuid;
  ator_nome text;
  ator_email text;
  ator_papel text;
  titulo text;
begin
  ator_id := auth.uid();
  if ator_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  dados := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  ator_papel := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');

  select
    nullif(u.raw_user_meta_data ->> 'nome', ''),
    u.email
  into ator_nome, ator_email
  from auth.users u
  where u.id = ator_id;

  ator_nome := coalesce(
    ator_nome,
    case ator_papel
      when 'admin' then 'Administrador sem nome cadastrado'
      when 'socio' then 'Sócio sem nome cadastrado'
      when 'juridico' then 'Jurídico sem nome cadastrado'
      else 'Colaborador sem nome cadastrado'
    end
  );
  titulo := coalesce(
    nullif(dados ->> 'titulo', ''), nullif(dados ->> 'nome', ''),
    nullif(dados ->> 'descricao', ''), nullif(dados ->> 'motoboy_nome', ''),
    nullif(dados ->> 'fornecedor_nome', ''), nullif(dados ->> 'chave', '')
  );

  insert into public.auditoria_acoes (
    tabela, registro_id, registro_titulo, acao,
    usuario_id, usuario_nome, usuario_email
  ) values (
    tg_table_name, nullif(dados ->> 'id', '')::uuid, left(titulo, 240),
    case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'excluiu' end,
    ator_id, ator_nome, ator_email
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.registrar_auditoria_erp() from public, anon, authenticated;
grant execute on function private.registrar_auditoria_erp() to service_role;

-- Corrige ações já registradas quando a conta possui nome cadastrado.
update public.auditoria_acoes a
set usuario_nome = coalesce(
  nullif(u.raw_user_meta_data ->> 'nome', ''),
  case coalesce(u.raw_app_meta_data ->> 'role', '')
    when 'admin' then 'Administrador sem nome cadastrado'
    when 'socio' then 'Sócio sem nome cadastrado'
    when 'juridico' then 'Jurídico sem nome cadastrado'
    else 'Colaborador sem nome cadastrado'
  end
)
from auth.users u
where u.id = a.usuario_id;
