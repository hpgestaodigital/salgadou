-- Diferencia o produto final do recheio/preparo intermediário.
update public.producao_fichas_tecnicas
set nome = case lower(btrim(nome))
  when 'pizza' then 'Rolinho de pizza'
  when 'calabresa' then 'Rolinho de calabresa'
  else nome
end,
updated_at = now()
where categoria = 'salgado'
  and lower(btrim(nome)) in ('pizza', 'calabresa');

update public.producao_produtos
set nome = case lower(btrim(nome))
  when 'pizza' then 'Rolinho de pizza'
  when 'calabresa' then 'Rolinho de calabresa'
  else nome
end
where lower(btrim(nome)) in ('pizza', 'calabresa');
