# Roadmap do ERP Salgadou

## Fase atual — operação interna confiável

- produção por planejamento e lote;
- separação entre em congelamento, aguardando empacotamento e estoque disponível;
- entrada real após empacotamento;
- retirada manual por venda, perda, consumo interno ou ajuste;
- histórico por produto e lote;
- baixa pelos lotes mais antigos quando nenhum lote for escolhido;
- contagem física periódica para auditoria.

## Etapa final — integração Saipos Data API

Esta etapa fica reservada para quando o restante do ERP estiver estabilizado.

Objetivos:

- integrar vendas e itens da Saipos ao ERP;
- alimentar o painel financeiro com vendas, cancelamentos e atualizações;
- baixar automaticamente o estoque de salgadinhos por sabor;
- tratar pedidos originados na Saipos e nas integrações, incluindo iFood;
- mapear itens comerciais, grupos de escolha, sabores e bônus de promoções por códigos estáveis;
- versionar regras de promoções para não alterar vendas antigas;
- impedir processamento duplicado pelo identificador da venda;
- reverter ou corrigir estoque em cancelamentos e alterações;
- manter contagem física como auditoria de perdas e diferenças operacionais.

Antes da ativação real, a loja demo da Saipos deverá validar pelo menos:

1. venda simples;
2. promoção com escolha de sabores;
3. promoção com bônus fixo;
4. promoção em que churros aparece na escolha e também como bônus;
5. o mesmo pedido vindo do iFood;
6. alteração e cancelamento de pedido;
7. retorno de itens, complementos e seus códigos pela Data API.

A integração automática só deverá baixar estoque quando a composição do pedido puder ser determinada por dados estruturados. Títulos e observações livres não devem ser usados como regra de estoque.
