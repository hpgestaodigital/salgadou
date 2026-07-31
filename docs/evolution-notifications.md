# Notificações WhatsApp com Evolution API

## Implantação

1. Aplique no Supabase, em ordem, as migrações até
   `20260731090000_notifications.sql`.
2. Configure no ambiente do servidor:
   `SUPABASE_SERVICE_ROLE_KEY`, `EVOLUTION_API_KEY` e `CRON_SECRET`.
   Nunca use essas chaves em variáveis `NEXT_PUBLIC_*`.
3. Em **Configurações**, informe a URL da Evolution API, o nome da
   instância e ative as notificações.
4. Cadastre o WhatsApp de colaboradores e sócios e mantenha habilitada a
   preferência **Receber notificações no WhatsApp**.

O `vercel.json` agenda uma verificação diária. Na Vercel, quando
`CRON_SECRET` está configurado, a chamada do Cron recebe automaticamente
`Authorization: Bearer <CRON_SECRET>`.

Em outra hospedagem, agende uma requisição diária:

```text
GET https://SEU-DOMINIO/api/notifications/process
Authorization: Bearer SEU_CRON_SECRET
```

## Regras

- O responsável ativo, com WhatsApp e preferência habilitada, recebe o aviso.
- Sem responsável válido, todos os sócios ativos e habilitados são avisados.
- O log usa uma chave única por registro, evento, dia e destinatário para
  evitar repetições excessivas.
- Sem as credenciais do servidor, nenhum envio é tentado.
