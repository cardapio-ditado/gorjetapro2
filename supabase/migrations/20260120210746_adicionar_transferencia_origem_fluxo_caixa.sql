/*
  # Adicionar 'transferencia' à constraint de origem do fluxo_caixa
  
  ## Problema
  - Ao criar transferências entre contas, o código envia 'transferencia' como origem
  - A constraint fluxo_caixa_origem_check não inclui 'transferencia' nos valores permitidos
  - Isso causa erro: "violates check constraint fluxo_caixa_origem_check"
  
  ## Solução
  - Remover a constraint antiga
  - Criar nova constraint incluindo 'transferencia' nos valores permitidos
  
  ## Valores permitidos para origem
  - 'manual': Lançamentos manuais diretos
  - 'conta_pagar': Oriundos de baixas de contas a pagar
  - 'conta_receber': Oriundos de recebimentos de contas a receber
  - 'recorrente': Oriundos de lançamentos recorrentes
  - 'transferencia': Oriundos de transferências entre contas bancárias
*/

-- Remover a constraint antiga
ALTER TABLE fluxo_caixa 
DROP CONSTRAINT IF EXISTS fluxo_caixa_origem_check;

-- Adicionar a nova constraint com 'transferencia'
ALTER TABLE fluxo_caixa 
ADD CONSTRAINT fluxo_caixa_origem_check 
CHECK (origem IN ('manual', 'conta_pagar', 'conta_receber', 'recorrente', 'transferencia'));
