-- Catálogo inicial, edição segura e custos das fichas técnicas.

alter table public.producao_insumos
  add column if not exists controla_estoque boolean not null default true,
  add column if not exists custo_unitario numeric(14,4) not null default 0 check (custo_unitario >= 0);

alter table public.producao_fichas_tecnicas
  add column if not exists rendimento_confirmado boolean not null default false,
  add column if not exists revisao_pendente boolean not null default false,
  add column if not exists versao integer not null default 1 check (versao > 0),
  add column if not exists inativado_em timestamptz,
  add column if not exists inativado_por uuid references auth.users(id),
  add column if not exists motivo_inativacao text;

create table if not exists public.producao_ficha_revisoes (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid references public.producao_fichas_tecnicas(id) on delete set null,
  acao text not null check (acao in ('edicao','inativacao','reativacao')),
  versao integer not null,
  dados_anteriores jsonb not null,
  criado_por uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.producao_ficha_revisoes enable row level security;
create policy "Ler revisoes de fichas" on public.producao_ficha_revisoes
for select to authenticated
using (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento'));
revoke insert, update, delete on public.producao_ficha_revisoes from authenticated;

create or replace function private.validar_ciclo_ficha()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.componente_ficha_id is null then return new; end if;
  if new.ficha_id = new.componente_ficha_id then raise exception 'Uma ficha não pode usar a si mesma'; end if;

  if exists (
    with recursive descendentes as (
      select fi.componente_ficha_id as id, array[fi.ficha_id, fi.componente_ficha_id]::uuid[] as caminho
      from public.producao_ficha_itens fi
      where fi.ficha_id = new.componente_ficha_id and fi.componente_ficha_id is not null
      union all
      select fi.componente_ficha_id, d.caminho || fi.componente_ficha_id
      from descendentes d
      join public.producao_ficha_itens fi on fi.ficha_id = d.id and fi.componente_ficha_id is not null
      where not fi.componente_ficha_id = any(d.caminho)
    )
    select 1 from descendentes where id = new.ficha_id
  ) then
    raise exception 'Este componente criaria um ciclo entre fichas técnicas';
  end if;
  return new;
end;
$$;

drop trigger if exists validar_ciclo_ficha_trigger on public.producao_ficha_itens;
create trigger validar_ciclo_ficha_trigger
before insert or update of ficha_id, componente_ficha_id on public.producao_ficha_itens
for each row execute function private.validar_ciclo_ficha();

create or replace function public.atualizar_ficha_tecnica(
  ficha_id_param uuid,
  nome_param text,
  categoria_param text,
  rendimento_param numeric,
  unidade_param text,
  capacidade_param numeric,
  modo_preparo_param text,
  observacoes_param text,
  rendimento_confirmado_param boolean,
  revisao_pendente_param boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare ficha public.producao_fichas_tecnicas%rowtype;
begin
  if auth.uid() is null or not (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')) then raise exception 'Acesso negado'; end if;
  if nullif(btrim(nome_param),'') is null then raise exception 'Informe o nome da ficha'; end if;
  if categoria_param not in ('salgado','massa','recheio','molho') then raise exception 'Categoria inválida'; end if;
  if rendimento_param is null or rendimento_param <= 0 then raise exception 'Rendimento inválido'; end if;
  if unidade_param not in ('un','g','kg','ml','l') then raise exception 'Unidade inválida'; end if;

  select * into ficha from public.producao_fichas_tecnicas where id=ficha_id_param for update;
  if not found then raise exception 'Ficha não encontrada'; end if;

  insert into public.producao_ficha_revisoes(ficha_id,acao,versao,dados_anteriores,criado_por)
  values (ficha.id,'edicao',ficha.versao,to_jsonb(ficha),auth.uid());

  update public.producao_fichas_tecnicas set
    nome=btrim(nome_param), categoria=categoria_param, rendimento_padrao=rendimento_param,
    unidade_rendimento=unidade_param, capacidade_unidades_aprox=case when capacidade_param>0 then capacidade_param else null end,
    modo_preparo=nullif(btrim(modo_preparo_param),''), observacoes=nullif(btrim(observacoes_param),''),
    rendimento_confirmado=coalesce(rendimento_confirmado_param,false), revisao_pendente=coalesce(revisao_pendente_param,false),
    versao=versao+1, updated_at=now()
  where id=ficha.id;
end;
$$;

create or replace function public.inativar_ficha_tecnica(ficha_id_param uuid, motivo_param text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare ficha public.producao_fichas_tecnicas%rowtype;
begin
  if auth.uid() is null or not (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')) then raise exception 'Acesso negado'; end if;
  select * into ficha from public.producao_fichas_tecnicas where id=ficha_id_param for update;
  if not found then raise exception 'Ficha não encontrada'; end if;
  insert into public.producao_ficha_revisoes(ficha_id,acao,versao,dados_anteriores,criado_por)
  values (ficha.id,'inativacao',ficha.versao,to_jsonb(ficha),auth.uid());
  update public.producao_fichas_tecnicas set ativo=false,inativado_em=now(),inativado_por=auth.uid(),motivo_inativacao=nullif(btrim(motivo_param),''),versao=versao+1,updated_at=now() where id=ficha.id;
end;
$$;

create or replace function public.reativar_ficha_tecnica(ficha_id_param uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare ficha public.producao_fichas_tecnicas%rowtype;
begin
  if auth.uid() is null or not (private.usuario_pode_acessar('producao_estoque') or private.usuario_pode_acessar('producao_planejamento')) then raise exception 'Acesso negado'; end if;
  select * into ficha from public.producao_fichas_tecnicas where id=ficha_id_param for update;
  if not found then raise exception 'Ficha não encontrada'; end if;
  insert into public.producao_ficha_revisoes(ficha_id,acao,versao,dados_anteriores,criado_por)
  values (ficha.id,'reativacao',ficha.versao,to_jsonb(ficha),auth.uid());
  update public.producao_fichas_tecnicas set ativo=true,inativado_em=null,inativado_por=null,motivo_inativacao=null,versao=versao+1,updated_at=now() where id=ficha.id;
end;
$$;

revoke all on function public.atualizar_ficha_tecnica(uuid,text,text,numeric,text,numeric,text,text,boolean,boolean) from public;
revoke all on function public.inativar_ficha_tecnica(uuid,text) from public;
revoke all on function public.reativar_ficha_tecnica(uuid) from public;
grant execute on function public.atualizar_ficha_tecnica(uuid,text,text,numeric,text,numeric,text,text,boolean,boolean) to authenticated;
grant execute on function public.inativar_ficha_tecnica(uuid,text) to authenticated;
grant execute on function public.reativar_ficha_tecnica(uuid) to authenticated;

create or replace view public.producao_custos_fichas as
with recursive arvore as (
  select f.id as raiz_id, f.id as ficha_id, 1::numeric as multiplicador, array[f.id]::uuid[] as caminho
  from public.producao_fichas_tecnicas f
  where f.ativo
  union all
  select a.raiz_id, fi.componente_ficha_id,
    a.multiplicador * private.converter_unidade_producao(fi.quantidade,fi.unidade,cf.unidade_rendimento) / nullif(cf.rendimento_padrao,0),
    a.caminho || fi.componente_ficha_id
  from arvore a
  join public.producao_ficha_itens fi on fi.ficha_id=a.ficha_id and fi.componente_ficha_id is not null
  join public.producao_fichas_tecnicas cf on cf.id=fi.componente_ficha_id
  where not fi.componente_ficha_id=any(a.caminho)
), custos as (
  select a.raiz_id,
    sum(a.multiplicador * private.converter_unidade_producao(fi.quantidade,fi.unidade,i.unidade) * i.custo_unitario)::numeric(14,4) as custo_receita
  from arvore a
  join public.producao_ficha_itens fi on fi.ficha_id=a.ficha_id and fi.insumo_id is not null
  join public.producao_insumos i on i.id=fi.insumo_id
  group by a.raiz_id
)
select f.id as ficha_id,f.nome,f.categoria,coalesce(c.custo_receita,0)::numeric(14,4) as custo_receita,
  case when f.rendimento_padrao>0 then (coalesce(c.custo_receita,0)/f.rendimento_padrao)::numeric(14,6) else 0 end as custo_por_unidade_rendimento
from public.producao_fichas_tecnicas f left join custos c on c.raiz_id=f.id;
grant select on public.producao_custos_fichas to authenticated;

-- Insumos conhecidos. Água e temperos sem medida exata ficam visíveis na ficha, mas não bloqueiam produção/compras.
insert into public.producao_insumos(nome,unidade,estoque_atual,estoque_minimo,ativo,controla_estoque)
select x.nome,x.unidade,0,0,true,x.controla from (values
 ('Água','l',false),('Caldo de galinha','g',true),('Óleo','ml',true),('Farinha de trigo','kg',true),
 ('Caldo de carne','g',true),('Frango','kg',true),('Tempero Ana Maria','g',true),('Creme de cebola','g',true),
 ('Colorau','g',true),('Carne','kg',true),('Tempero Edu Guedes','g',true),('Trigo para kibe','kg',true),
 ('Carne moída','kg',true),('Tempero para carne','g',true),('Queijo - peça inteira','un',true),
 ('Presunto - peça inteira','un',true),('Calabresa - gomo','un',true),('Açúcar','g',true),('Sal','g',true),
 ('Essência de baunilha - medida','un',true),('Caldo de galinha - colher','un',true),
 ('Hortelã triturada','g',false),('Alho pronto triturado','g',false),('Orégano','g',false)
) as x(nome,unidade,controla)
where not exists (select 1 from public.producao_insumos i where lower(i.nome)=lower(x.nome));

create or replace function private.seed_ficha(
  nome_param text,categoria_param text,unidade_param text,rendimento_param numeric,capacidade_param numeric,
  confirmado_param boolean,revisao_param boolean,modo_param text,observacoes_param text
) returns uuid language plpgsql set search_path=pg_catalog,public,private as $$
declare resultado uuid;
begin
  select id into resultado from public.producao_fichas_tecnicas where lower(nome)=lower(nome_param) and categoria=categoria_param limit 1;
  if resultado is null then
    insert into public.producao_fichas_tecnicas(nome,categoria,unidade_rendimento,rendimento_padrao,capacidade_unidades_aprox,rendimento_confirmado,revisao_pendente,modo_preparo,observacoes)
    values(nome_param,categoria_param,unidade_param,rendimento_param,capacidade_param,confirmado_param,revisao_param,modo_param,observacoes_param) returning id into resultado;
  else
    update public.producao_fichas_tecnicas set ativo=true,unidade_rendimento=unidade_param,rendimento_padrao=rendimento_param,
      capacidade_unidades_aprox=capacidade_param,rendimento_confirmado=confirmado_param,revisao_pendente=revisao_param,
      modo_preparo=modo_param,observacoes=observacoes_param,updated_at=now() where id=resultado;
  end if;
  return resultado;
end;$$;

create or replace function private.seed_item_insumo(ficha_nome text,ficha_categoria text,insumo_nome text,quantidade_param numeric,unidade_param text)
returns void language plpgsql set search_path=pg_catalog,public,private as $$
declare f uuid; i uuid;
begin
 select id into f from public.producao_fichas_tecnicas where lower(nome)=lower(ficha_nome) and categoria=ficha_categoria limit 1;
 select id into i from public.producao_insumos where lower(nome)=lower(insumo_nome) limit 1;
 if f is not null and i is not null and not exists(select 1 from public.producao_ficha_itens where ficha_id=f and insumo_id=i) then
   insert into public.producao_ficha_itens(ficha_id,insumo_id,quantidade,unidade) values(f,i,quantidade_param,unidade_param);
 end if;
end;$$;

create or replace function private.seed_item_componente(ficha_nome text,ficha_categoria text,componente_nome text,componente_categoria text,quantidade_param numeric,unidade_param text)
returns void language plpgsql set search_path=pg_catalog,public,private as $$
declare f uuid; c uuid;
begin
 select id into f from public.producao_fichas_tecnicas where lower(nome)=lower(ficha_nome) and categoria=ficha_categoria limit 1;
 select id into c from public.producao_fichas_tecnicas where lower(nome)=lower(componente_nome) and categoria=componente_categoria limit 1;
 if f is not null and c is not null and not exists(select 1 from public.producao_ficha_itens where ficha_id=f and componente_ficha_id=c) then
   insert into public.producao_ficha_itens(ficha_id,componente_ficha_id,quantidade,unidade) values(f,c,quantidade_param,unidade_param);
 end if;
end;$$;

select private.seed_ficha('Massa de Caldo de Galinha','massa','kg',12,1600,true,false,
'1. Colocar água, caldo de galinha e óleo na panela. 2. Levar ao fogo até ferver. 3. Adicionar toda a farinha. 4. Manter em fogo baixo. 5. Misturar por aproximadamente 10 minutos até cozinhar completamente. 6. Desligar o fogo.',
'Uma receita rende 12 kg de massa e aproximadamente 1.600 salgados.');
select private.seed_ficha('Massa de Caldo de Carne','massa','kg',12,1600,true,false,
'1. Colocar água, caldo de carne e óleo na panela. 2. Levar ao fogo até ferver. 3. Adicionar toda a farinha. 4. Manter em fogo baixo. 5. Misturar por aproximadamente 10 minutos até cozinhar completamente. 6. Desligar o fogo.',
'Uma receita rende 12 kg de massa e aproximadamente 1.600 salgados.');
select private.seed_ficha('Recheio de Coxinha','recheio','kg',14,null,false,true,
'Colocar os ingredientes na masseira, processar o frango na própria masseira e misturar/cozinhar até o ponto ideal.',
'Base da receita: 14 kg de frango. O rendimento final ainda não foi pesado. O bechamel é misturado ao recheio, mas a quantidade por receita precisa ser confirmada.');
select private.seed_ficha('Recheio de Risoli','recheio','kg',5,null,false,true,
'Colocar os ingredientes na masseira, processar a carne na própria masseira e misturar/cozinhar até o ponto ideal.',
'Base da receita: 5 kg de carne. O rendimento final e o volume do copo azul ainda precisam ser medidos.');
select private.seed_ficha('Base de Kibe','massa','kg',3,null,false,true,
'Ferver 4 litros de água, adicionar 6 pacotes de 500 g de trigo para kibe e deixar hidratar por 2 horas.',
'O peso final após hidratação ainda precisa ser medido.');
select private.seed_ficha('Recheio de Kibe','recheio','kg',1.5,null,false,true,
'Triturar bem a hortelã com o alho. Misturar todos os ingredientes e utilizar no kibe.',
'Quantidades de hortelã e alho ainda precisam ser medidas. A receita também informa 300 g de trigo na etapa do recheio.');
select private.seed_ficha('Recheio de Pizza','recheio','un',1,null,false,true,
'Misturar queijo, presunto e orégano conforme o padrão operacional.',
'As peças de queijo e presunto ainda precisam ser convertidas para peso. Orégano a gosto.');
select private.seed_ficha('Recheio de Calabresa','recheio','un',1,null,false,true,
'Misturar queijo, presunto, calabresa e orégano conforme o padrão operacional.',
'As peças e os gomos ainda precisam ser convertidos para peso. Orégano a gosto.');
select private.seed_ficha('Massa de Churros','massa','kg',12,1600,false,true,
'Preparar a massa com água, óleo, açúcar, sal e essência de baunilha conforme o processo padrão de cocção.',
'O rascunho informa 5 kg de “churros”; confirmar se corresponde a 5 kg de farinha de trigo. Rendimento de 12 kg/1.600 unidades mantido como referência operacional até revisão.');
select private.seed_ficha('Bechamel da Coxinha','recheio','kg',2.6,null,false,true,
'Misturar 2 litros de água, farinha e caldo de galinha, cozinhar e incorporar ao recheio da coxinha.',
'O rendimento de 2,6 kg é apenas a soma nominal de água e farinha, sem medição real. Confirmar o peso e a medida das colheres.');

select private.seed_ficha('Coxinha','salgado','un',1600,null,true,false,null,'Usa massa padrão de caldo de galinha e recheio de coxinha.');
select private.seed_ficha('Risoli','salgado','un',1600,null,true,false,null,'Usa massa padrão de caldo de carne e recheio de risoli.');
select private.seed_ficha('Kibe','salgado','un',1600,null,false,true,null,'Quantidade final e proporção entre base e recheio precisam ser confirmadas.');
select private.seed_ficha('Pizza','salgado','un',1600,null,false,true,null,'Massa padrão a confirmar. Peças do recheio precisam ser pesadas.');
select private.seed_ficha('Calabresa','salgado','un',1600,null,false,true,null,'Massa padrão a confirmar. Peças e gomos precisam ser pesados.');
select private.seed_ficha('Churros','salgado','un',1600,null,false,true,null,'Recheio do churros não foi informado no rascunho.');

select private.seed_item_insumo('Massa de Caldo de Galinha','massa','Água',9,'l');
select private.seed_item_insumo('Massa de Caldo de Galinha','massa','Caldo de galinha',150,'g');
select private.seed_item_insumo('Massa de Caldo de Galinha','massa','Óleo',600,'ml');
select private.seed_item_insumo('Massa de Caldo de Galinha','massa','Farinha de trigo',5,'kg');
select private.seed_item_insumo('Massa de Caldo de Carne','massa','Água',9,'l');
select private.seed_item_insumo('Massa de Caldo de Carne','massa','Caldo de carne',150,'g');
select private.seed_item_insumo('Massa de Caldo de Carne','massa','Óleo',600,'ml');
select private.seed_item_insumo('Massa de Caldo de Carne','massa','Farinha de trigo',5,'kg');
select private.seed_item_insumo('Recheio de Coxinha','recheio','Frango',14,'kg');
select private.seed_item_insumo('Recheio de Coxinha','recheio','Tempero Ana Maria',70,'g');
select private.seed_item_insumo('Recheio de Coxinha','recheio','Caldo de galinha',100,'g');
select private.seed_item_insumo('Recheio de Coxinha','recheio','Creme de cebola',100,'g');
select private.seed_item_insumo('Recheio de Coxinha','recheio','Colorau',40,'g');
select private.seed_item_insumo('Recheio de Risoli','recheio','Carne',5,'kg');
select private.seed_item_insumo('Recheio de Risoli','recheio','Tempero Edu Guedes',100,'g');
select private.seed_item_insumo('Recheio de Risoli','recheio','Creme de cebola',100,'g');
select private.seed_item_insumo('Recheio de Risoli','recheio','Caldo de carne',100,'g');
select private.seed_item_insumo('Recheio de Risoli','recheio','Farinha de trigo',200,'g');
select private.seed_item_insumo('Base de Kibe','massa','Trigo para kibe',3,'kg');
select private.seed_item_insumo('Base de Kibe','massa','Água',4,'l');
select private.seed_item_insumo('Recheio de Kibe','recheio','Carne moída',1.5,'kg');
select private.seed_item_insumo('Recheio de Kibe','recheio','Hortelã triturada',1,'g');
select private.seed_item_insumo('Recheio de Kibe','recheio','Alho pronto triturado',1,'g');
select private.seed_item_insumo('Recheio de Kibe','recheio','Tempero Edu Guedes',200,'g');
select private.seed_item_insumo('Recheio de Kibe','recheio','Creme de cebola',200,'g');
select private.seed_item_insumo('Recheio de Kibe','recheio','Tempero para carne',100,'g');
select private.seed_item_insumo('Recheio de Kibe','recheio','Trigo para kibe',300,'g');
select private.seed_item_insumo('Recheio de Kibe','recheio','Óleo',360,'ml');
select private.seed_item_insumo('Recheio de Pizza','recheio','Queijo - peça inteira',1,'un');
select private.seed_item_insumo('Recheio de Pizza','recheio','Presunto - peça inteira',1,'un');
select private.seed_item_insumo('Recheio de Pizza','recheio','Orégano',1,'g');
select private.seed_item_insumo('Recheio de Calabresa','recheio','Queijo - peça inteira',1,'un');
select private.seed_item_insumo('Recheio de Calabresa','recheio','Presunto - peça inteira',1,'un');
select private.seed_item_insumo('Recheio de Calabresa','recheio','Calabresa - gomo',7,'un');
select private.seed_item_insumo('Recheio de Calabresa','recheio','Orégano',1,'g');
select private.seed_item_insumo('Massa de Churros','massa','Açúcar',300,'g');
select private.seed_item_insumo('Massa de Churros','massa','Sal',100,'g');
select private.seed_item_insumo('Massa de Churros','massa','Água',9,'l');
select private.seed_item_insumo('Massa de Churros','massa','Óleo',600,'ml');
select private.seed_item_insumo('Massa de Churros','massa','Essência de baunilha - medida',3,'un');
select private.seed_item_insumo('Bechamel da Coxinha','recheio','Água',2,'l');
select private.seed_item_insumo('Bechamel da Coxinha','recheio','Caldo de galinha - colher',2,'un');
select private.seed_item_insumo('Bechamel da Coxinha','recheio','Farinha de trigo',600,'g');
select private.seed_item_componente('Coxinha','salgado','Massa de Caldo de Galinha','massa',12,'kg');
select private.seed_item_componente('Coxinha','salgado','Recheio de Coxinha','recheio',14,'kg');
select private.seed_item_componente('Risoli','salgado','Massa de Caldo de Carne','massa',12,'kg');
select private.seed_item_componente('Risoli','salgado','Recheio de Risoli','recheio',5,'kg');

insert into public.producao_produtos(nome,unidade,ativo,ficha_tecnica_id)
select f.nome,'un',true,f.id from public.producao_fichas_tecnicas f
where f.categoria='salgado' and f.nome in ('Coxinha','Risoli','Kibe','Pizza','Calabresa','Churros')
and not exists(select 1 from public.producao_produtos p where lower(p.nome)=lower(f.nome));
update public.producao_produtos p set ficha_tecnica_id=f.id
from public.producao_fichas_tecnicas f where lower(p.nome)=lower(f.nome) and f.categoria='salgado' and p.ficha_tecnica_id is null;

drop function private.seed_item_componente(text,text,text,text,numeric,text);
drop function private.seed_item_insumo(text,text,text,numeric,text);
drop function private.seed_ficha(text,text,text,numeric,numeric,boolean,boolean,text,text);