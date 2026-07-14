# Sistema de Estorno de Pagamentos - Documentação

## Visão Geral

Sistema completo para gestão de estornos de pagamentos parciais no módulo financeiro, com sincronização automática entre fluxo de caixa e contas a pagar.

## Funcionalidades Implementadas

### 1. Estorno de Pagamentos Parciais

Permite estornar pagamentos que foram realizados por engano, com registro completo de auditoria.

**Características:**
- Estorno de pagamentos individuais do fluxo de caixa
- Ajuste automático do saldo da conta a pagar
- Registro de motivo obrigatório
- Histórico completo de todos os estornos
- Proteção contra estorno duplicado

### 2. Exclusão Automática Sincronizada

Quando um lançamento de saída do fluxo de caixa é excluído:
- O valor pago na conta a pagar é automaticamente reduzido
- O saldo restante é recalculado
- O status é atualizado (pendente/parcial/pago)
- A exclusão é registrada no histórico de estornos

## Estrutura do Banco de Dados

### Nova Tabela: `historico_estornos_pagamento`

```sql
CREATE TABLE historico_estornos_pagamento (
  id uuid PRIMARY KEY,
  fluxo_caixa_id uuid,
  conta_pagar_id uuid,
  valor_estornado numeric,
  motivo text,
  estornado_por uuid,
  data_estorno timestamptz,
  observacoes text,
  criado_em timestamptz
);
```

**Campos:**
- `fluxo_caixa_id`: Referência ao lançamento estornado (pode ser NULL se excluído)
- `conta_pagar_id`: Conta a pagar relacionada
- `valor_estornado`: Valor que foi estornado
- `motivo`: Motivo do estorno (obrigatório)
- `estornado_por`: Usuário que realizou o estorno
- `data_estorno`: Data/hora do estorno
- `observacoes`: Detalhes adicionais do estorno

## Funções do Banco de Dados

### 1. `estornar_pagamento_parcial()`

Estorna um pagamento específico do fluxo de caixa.

**Parâmetros:**
- `p_fluxo_caixa_id`: ID do lançamento a ser estornado
- `p_motivo`: Motivo do estorno (obrigatório)
- `p_observacoes`: Observações adicionais (opcional)

**Retorno:**
```json
{
  "success": true,
  "estorno_id": "uuid",
  "valor_estornado": 1000.00,
  "conta_pagar_id": "uuid",
  "novo_valor_pago": 500.00,
  "novo_saldo_restante": 500.00,
  "novo_status": "parcial",
  "message": "Pagamento estornado com sucesso"
}
```

**Validações:**
- Lançamento deve existir
- Lançamento deve estar vinculado a uma conta a pagar
- Lançamento deve ser do tipo "saida"
- Lançamento não pode ter sido estornado anteriormente

**Processo:**
1. Valida o lançamento
2. Registra o estorno no histórico
3. Atualiza a conta a pagar (reduz valor_pago, aumenta saldo_restante)
4. Recalcula o status (pendente/parcial/pago)
5. Remove data_baixa_integral se necessário
6. Exclui o lançamento do fluxo de caixa
7. Retorna resultado da operação

### 2. `reverter_pagamento_contas_pagar()`

Trigger executado automaticamente ao excluir lançamento do fluxo de caixa.

**Funcionalidade:**
- Detecta exclusão de lançamentos de saída vinculados a contas a pagar
- Registra automaticamente no histórico como "Exclusão manual"
- Atualiza a conta a pagar correspondente
- Evita registro duplicado se já foi estornado via função

## Interface do Usuário

### Novo Componente: HistoricoPagamentosEstorno

Localização: `src/components/financeiro/HistoricoPagamentosEstorno.tsx`

**Seções:**

#### 1. Pagamentos Realizados (últimos 30 dias)

Exibe todos os pagamentos realizados com:
- Data do pagamento
- Fornecedor
- Descrição da conta
- Valor pago
- Forma de pagamento e conta bancária
- Status (Ativo/Estornado)
- Botão "Estornar" (apenas para pagamentos não estornados)

#### 2. Histórico de Estornos

Lista completa de todos os estornos realizados:
- Data e hora do estorno
- Valor estornado
- Motivo do estorno
- Usuário que realizou o estorno

### Modal de Estorno

**Campos:**
- **Motivo do Estorno** (obrigatório - seleção)
  - Pagamento duplicado
  - Valor incorreto
  - Conta errada
  - Fornecedor errado
  - Solicitação do fornecedor
  - Outro erro operacional

- **Observações Adicionais** (opcional - texto livre)
  - Campo para detalhar melhor o motivo do estorno

**Informações Exibidas:**
- Fornecedor
- Descrição da conta
- Data do pagamento
- Valor pago

**Avisos de Segurança:**
- Destaque visual de que a ação é irreversível
- Mensagem clara sobre o que será feito
- Confirmação dupla (modal + confirm)

## Como Usar

### 1. Acessar o Módulo

1. Navegue até **Financeiro**
2. Clique na aba **"Histórico e Estornos"**

### 2. Estornar um Pagamento

1. Localize o pagamento na lista de "Pagamentos Realizados"
2. Clique no botão **"Estornar"**
3. Selecione o **motivo do estorno** (obrigatório)
4. Adicione **observações adicionais** se necessário
5. Clique em **"Confirmar Estorno"**
6. Confirme a ação no alerta de confirmação

### 3. Verificar Histórico de Estornos

Na seção "Histórico de Estornos" você pode:
- Ver todos os estornos realizados
- Verificar quem realizou cada estorno
- Consultar motivos e datas

## Regras de Negócio

### Validações de Estorno

1. **Apenas saídas podem ser estornadas**
   - Lançamentos de entrada não podem ser estornados

2. **Deve estar vinculado a conta a pagar**
   - Lançamentos sem vínculo com contas a pagar não podem ser estornados

3. **Estorno único**
   - Cada pagamento só pode ser estornado uma vez
   - Pagamentos já estornados ficam marcados com badge "ESTORNADO"

4. **Motivo obrigatório**
   - Todo estorno deve ter um motivo registrado para auditoria

### Atualização da Conta a Pagar

Ao estornar um pagamento:

1. **valor_pago** é reduzido pelo valor estornado
2. **saldo_restante** é aumentado pelo valor estornado
3. **status** é recalculado:
   - `pendente`: se valor_pago = 0
   - `parcial`: se 0 < valor_pago < valor_total
   - `pago`: se valor_pago >= valor_total

4. **data_baixa_integral** é removida se o pagamento não estiver mais totalmente quitado

### Segurança e Auditoria

1. **Registro Completo**
   - Todo estorno é registrado com:
     - Usuário responsável
     - Data e hora
     - Motivo
     - Valor estornado
     - Conta afetada

2. **Rastreabilidade**
   - Histórico permanente de todos os estornos
   - Não é possível excluir registros de estorno
   - Vínculo com o usuário que realizou a ação

3. **Proteção de Dados**
   - RLS habilitado na tabela de histórico
   - Apenas usuários autenticados podem visualizar e realizar estornos

## Exemplos de Uso

### Exemplo 1: Pagamento Duplicado

**Cenário:**
- Conta a pagar: R$ 1.000,00
- Pagamento 1: R$ 500,00 (correto)
- Pagamento 2: R$ 500,00 (duplicado por engano)

**Ação:**
1. Estornar o Pagamento 2
2. Motivo: "Pagamento duplicado"
3. Observação: "Erro operacional ao dar baixa"

**Resultado:**
- Conta a pagar volta para: Valor pago R$ 500,00, Saldo R$ 500,00, Status "parcial"
- Lançamento 2 removido do fluxo de caixa
- Estorno registrado no histórico

### Exemplo 2: Valor Incorreto

**Cenário:**
- Conta a pagar: R$ 1.000,00
- Pagamento: R$ 800,00 (deveria ser R$ 1.000,00)

**Ação:**
1. Estornar o pagamento de R$ 800,00
2. Motivo: "Valor incorreto"
3. Observação: "Valor correto é R$ 1.000,00"
4. Realizar novo pagamento com valor correto

**Resultado:**
- Conta volta para status "pendente" com saldo R$ 1.000,00
- Novo pagamento correto pode ser realizado

### Exemplo 3: Fornecedor Errado

**Cenário:**
- Pagamento feito para Fornecedor A
- Deveria ter sido para Fornecedor B

**Ação:**
1. Estornar o pagamento
2. Motivo: "Fornecedor errado"
3. Observação: "Pagamento feito para Fornecedor A, deveria ser B"

**Resultado:**
- Conta do Fornecedor A volta para pendente
- Pagamento pode ser feito corretamente para Fornecedor B

## Integrações

### Com Fluxo de Caixa

- Estorno remove o lançamento do fluxo de caixa
- Trigger automático detecta exclusões manuais
- Sincronização bidirecional garantida

### Com Contas a Pagar

- Atualização automática de valores
- Recálculo de status
- Ajuste de datas de baixa

### Com Sistema de Auditoria

- Registro permanente de todas as ações
- Vínculo com usuários
- Histórico imutável

## Manutenção e Troubleshooting

### Verificar Estornos de uma Conta

```sql
SELECT
  h.*,
  fc.descricao as descricao_pagamento,
  cp.descricao as descricao_conta
FROM historico_estornos_pagamento h
LEFT JOIN fluxo_caixa fc ON fc.id = h.fluxo_caixa_id
JOIN contas_pagar cp ON cp.id = h.conta_pagar_id
WHERE h.conta_pagar_id = 'uuid-da-conta'
ORDER BY h.data_estorno DESC;
```

### Verificar Pagamentos Não Estornados

```sql
SELECT
  fc.*,
  cp.descricao as conta_descricao,
  f.nome as fornecedor_nome
FROM fluxo_caixa fc
JOIN contas_pagar cp ON cp.id = fc.conta_pagar_id
JOIN fornecedores f ON f.id = cp.fornecedor_id
WHERE fc.tipo = 'saida'
  AND fc.conta_pagar_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM historico_estornos_pagamento h
    WHERE h.fluxo_caixa_id = fc.id
  )
ORDER BY fc.data DESC;
```

### Relatório de Estornos por Período

```sql
SELECT
  DATE(data_estorno) as data,
  COUNT(*) as total_estornos,
  SUM(valor_estornado) as valor_total_estornado
FROM historico_estornos_pagamento
WHERE data_estorno >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(data_estorno)
ORDER BY data DESC;
```

## Considerações de Segurança

1. **Permissões**
   - Apenas usuários autenticados podem realizar estornos
   - Todos os estornos são rastreados por usuário

2. **Auditoria**
   - Histórico completo e permanente
   - Não é possível excluir registros de estorno
   - Motivo obrigatório para rastreabilidade

3. **Validações**
   - Múltiplas validações antes de permitir estorno
   - Proteção contra estornos duplicados
   - Confirmação dupla na interface

4. **Integridade**
   - Transações atômicas garantem consistência
   - Triggers automáticos mantêm sincronização
   - Foreign keys previnem dados órfãos

## Conclusão

O sistema de estorno de pagamentos fornece:
- ✅ Correção fácil de erros operacionais
- ✅ Sincronização automática entre módulos
- ✅ Auditoria completa de todas as ações
- ✅ Interface intuitiva e segura
- ✅ Proteção contra erros e duplicações
- ✅ Rastreabilidade total das operações

O sistema está pronto para uso em produção e atende às necessidades de gestão financeira com segurança e controle total.
