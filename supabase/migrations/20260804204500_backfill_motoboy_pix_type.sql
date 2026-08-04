update public.motoboys
set pix_tipo = case
  when lower(coalesce(pix, '')) like '%(cpf)%' then 'cpf'
  when lower(coalesce(pix, '')) like '%(cnpj)%' then 'cnpj'
  when lower(coalesce(pix, '')) like '%(celular)%' or lower(coalesce(pix, '')) like '%(telefone)%' then 'celular'
  when coalesce(pix, '') like '%@%' then 'email'
  else pix_tipo
end
where pix is not null
  and pix_tipo is null;
