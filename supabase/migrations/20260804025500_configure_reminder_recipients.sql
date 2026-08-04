insert into public.configuracoes (chave, valor)
values
  ('lembrete_destinatarios_escala', '[]'),
  ('lembrete_destinatarios_fornecedor', '[]'),
  ('lembrete_fornecedor_incluir_fornecedor', 'true'),
  ('lembrete_destinatarios_motoboy', '[]')
on conflict (chave) do nothing;
