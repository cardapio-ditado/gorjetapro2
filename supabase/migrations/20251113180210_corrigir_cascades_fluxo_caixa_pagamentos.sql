/*
  # Corrigir CASCADE em todas as constraints relacionadas a exclusão de contas

  1. Problema Identificado
    - fluxo_caixa.pagamento_id → pagamentos_contas(id) está com NO ACTION em vez de CASCADE
    - fluxo_caixa.conta_pagar_id → contas_pagar(id) está com NO ACTION em vez de CASCADE
    - Isso impede a exclusão de contas e pagamentos manuais

  2. Solução
    - Remover constraints antigas
    - Recriar com ON DELETE CASCADE
    - Garantir que ao excluir conta_pagar ou pagamento, o fluxo_caixa seja excluído automaticamente

  3. Fluxo de Exclusão Correto
    - Excluir conta_pagar → exclui pagamentos_contas (CASCADE) → exclui fluxo_caixa (CASCADE)
    - Excluir pagamento_contas → exclui fluxo_caixa (CASCADE)
*/

-- 1. Remover constraint de pagamento_id no fluxo_caixa
ALTER TABLE fluxo_caixa 
DROP CONSTRAINT IF EXISTS fluxo_caixa_pagamento_id_fkey;

-- 2. Remover constraint de conta_pagar_id no fluxo_caixa
ALTER TABLE fluxo_caixa 
DROP CONSTRAINT IF EXISTS fluxo_caixa_conta_pagar_id_fkey;

-- 3. Recriar constraint de pagamento_id com CASCADE
ALTER TABLE fluxo_caixa
ADD CONSTRAINT fluxo_caixa_pagamento_id_fkey 
FOREIGN KEY (pagamento_id) 
REFERENCES pagamentos_contas(id) 
ON DELETE CASCADE;

-- 4. Recriar constraint de conta_pagar_id com CASCADE
ALTER TABLE fluxo_caixa
ADD CONSTRAINT fluxo_caixa_conta_pagar_id_fkey 
FOREIGN KEY (conta_pagar_id) 
REFERENCES contas_pagar(id) 
ON DELETE CASCADE;

COMMENT ON CONSTRAINT fluxo_caixa_pagamento_id_fkey ON fluxo_caixa IS 
'Ao excluir um pagamento, os lançamentos no fluxo de caixa são excluídos automaticamente';

COMMENT ON CONSTRAINT fluxo_caixa_conta_pagar_id_fkey ON fluxo_caixa IS 
'Ao excluir uma conta a pagar, os lançamentos no fluxo de caixa são excluídos automaticamente';
