/*
  # Adicionar 'conta_receber' na constraint de origem do fluxo_caixa

  1. Problema
    - O trigger de recebimentos tenta inserir 'conta_receber' como origem no fluxo_caixa
    - A constraint fluxo_caixa_origem_check só aceita: 'manual', 'conta_pagar', 'recorrente'
    - Isso causa erro ao registrar recebimentos

  2. Solução
    - Remover a constraint antiga
    - Criar nova constraint incluindo 'conta_receber' nos valores permitidos

  3. Valores permitidos após a mudança
    - 'manual': Lançamentos manuais
    - 'conta_pagar': Oriundos de contas a pagar
    - 'conta_receber': Oriundos de contas a receber
    - 'recorrente': Oriundos de lançamentos recorrentes
*/

-- Remover a constraint antiga
ALTER TABLE fluxo_caixa 
DROP CONSTRAINT IF EXISTS fluxo_caixa_origem_check;

-- Adicionar a nova constraint com 'conta_receber'
ALTER TABLE fluxo_caixa 
ADD CONSTRAINT fluxo_caixa_origem_check 
CHECK (origem IN ('manual', 'conta_pagar', 'conta_receber', 'recorrente'));
