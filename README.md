# Salgadou Hub

Crie um MVP funcional chamado “Salgadou Gestão”, um sistema interno para os sócios da Salgadou.

Use:
- React + TypeScript
- Tailwind
- Supabase para autenticação, banco e storage
- Interface escura com destaque laranja
- Layout responsivo
- Dados reais, sem telas apenas mockadas

Apenas usuários internos terão login.

Não criar login para:
- fornecedores
- motoboys
- colaboradores
- freelancers

Criar usuário master inicial:
- e-mail: admin@admin.com
- senha inicial: admin420
- perfil: Master Admin
- 
- não expor a senha no frontend

Sócios iniciais:
- Henrique
- Heitor
- Pedro

Menu lateral:
- Dashboard
- Escala Semanal
- Kanban
- Pagto. Fornecedores
- Pagto. Motoboys
- Cadastros
- Usuários
- Configurações

DASHBOARD

Criar cards:
- A pagar — fornecedores
- A pagar — motoboys
- Pago no mês
- Equipe ativa
- Tarefas pendentes dos sócios
- Tarefas pendentes dos colaboradores

Abaixo mostrar:
- próximos vencimentos
- últimos pagamentos de motoboys
- tarefas prioritárias
- tarefas atrasadas

KANBAN

Criar uma tela Kanban com duas abas:

1. Sócios
2. Colaboradores

KANBAN DOS SÓCIOS

Responsáveis:
- Henrique
- Heitor
- Pedro

Colunas:
- Caixa de entrada
- A fazer
- Em andamento
- Aguardando terceiros
- Em revisão
- Concluído

Cada tarefa deve ter:
- título
- descrição
- responsável
- participantes
- prioridade
- área
- prazo
- checklist
- comentários
- anexos
- tags
- histórico

Prioridades:
- baixa
- média
- alta
- urgente

Permitir:
- arrastar tarefas
- delegar entre sócios
- filtrar por responsável
- filtrar por prioridade
- visualizar tarefas atrasadas
- visualizar por status ou por responsável

KANBAN DOS COLABORADORES

Os colaboradores não possuem acesso.

Apenas os sócios criam e acompanham tarefas.

Colunas:
- A delegar
- Delegado
- Em andamento
- Aguardando confirmação
- Concluído
- Não realizado

Cada tarefa deve ter:
- título
- descrição
- colaborador responsável
- sócio responsável pelo acompanhamento
- prazo
- prioridade
- checklist
- instruções
- observações
- anexos
- motivo de não realização

Permitir filtrar por:
- colaborador
- sócio responsável
- status
- prioridade
- atrasadas

ESCALA SEMANAL

Criar tabela semanal com:
- colaborador
- segunda a domingo
- horas
- dias trabalhados
- valor da diária
- total da semana
- observações

Cada dia aceita:
- um ou mais períodos
- descrição do período
- ocorrência

Ocorrências:
- Folga
- Falta justificada previamente
- Falta justificada posteriormente
- Falta não justificada

Regras:
- múltiplos períodos no mesmo dia contam uma diária
- somar horas de todos os períodos
- folgas e faltas não contam horas nem diária
- total semanal = dias trabalhados × valor da diária
- sócios podem ter diária zero
- salvar tudo no Supabase
- botão Duplicar semana
- ao duplicar, copiar horários e valores
- não copiar faltas nem observações temporárias

PAGAMENTOS DE FORNECEDORES

Campos:
- data do pedido
- vencimento
- fornecedor
- descrição
- valor
- observação
- pago em
- status
- PIX, boleto ou link
- comprovante
- responsável

Status automáticos:
- Pendente
- Vence amanhã
- Vence hoje
- Vencido
- Pago
- Cancelado

PAGAMENTOS DE MOTOBOYS

Campos:
- data
- motoboy
- número de entregas
- valor das taxas
- valor da diária
- total
- PIX
- pago em
- status
- observação
- comprovante
- responsável

Ao selecionar o motoboy:
- preencher PIX
- preencher valor padrão da diária

Total:
valor das taxas + valor da diária

CADASTROS

Criar abas:
- colaboradores
- motoboys
- fornecedores
- usuários internos
- áreas e tags

CONFIGURAÇÕES E EVOLUTION API

Criar tela de configurações igual ao padrão visual do sistema.

Campos:
- URL do servidor Evolution API
- nome da instância
- API Key
- número para teste
- botão Enviar mensagem de teste
- status da conexão
- último envio
- último erro

As credenciais devem ser usadas apenas no backend.
Não expor API Key no navegador.

Criar modelos editáveis de lembrete:

1. Escala semanal

“Olá {nome}! Lembrete da Salgadou: você tem escala nesta semana. Confira seus horários.”

2. Pagamento de fornecedor

“Olá! Salgadou aqui. Lembrete do pagamento do pedido {pedido} para {fornecedor}, no valor de {valor}, com vencimento em {vencimento}.”

3. Pagamento de motoboy

“Olá {nome}! Salgadou: fechamento do dia {data}. {entregas} entregas. Total a receber: {total}. PIX: {pix}.”

Criar função backend para envio via Evolution API.

A função deve:
- normalizar telefone
- adicionar código 55 quando necessário
- registrar sucesso ou erro
- evitar envio duplicado
- fazer até 3 tentativas

Criar logs de notificação com:
- destinatário
- telefone
- tipo
- mensagem
- status
- erro
- data do envio

Criar lembretes automáticos:

08:00
- pagamentos que vencem hoje

08:10
- pagamentos vencidos

17:00
- pagamentos que vencem amanhã

Também permitir envio manual de:
- escala semanal
- pagamento de fornecedor
- pagamento de motoboy

Não enviar automaticamente para fornecedores ou colaboradores sem ação interna.

BANCO

Criar tabelas para:
- profiles
- employees
- couriers
- suppliers
- schedule_weeks
- schedule_entries
- supplier_payments
- courier_payments
- tasks
- task_comments
- task_checklist_items
- task_attachments
- task_history
- notification_templates
- notification_logs
- app_settings

Aplicar RLS.
Usar UUID.
Registrar created_at e updated_at.

REGRAS GERAIS

- Não deixar botões sem função.
- Persistir dados no Supabase.
- Validar formulários.
- Pedir confirmação antes de excluir.
- Usar exclusão lógica quando houver histórico.
- Criar estados vazios.
- Garantir boa responsividade.
- Não criar módulos além dos solicitados.

Construa primeiro:
1. autenticação e layout
2. dashboard
3. cadastros
4. Kanban
5. escala
6. pagamentos
7. Evolution API e lembretes

Antes de avançar entre as etapas, teste persistência, permissões e responsividade.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://salgadou.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7cdc4f78-e87f-4296-be35-ee29efc9722a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
