/*
  # Desvincular Gorjetas do Sistema Financeiro

  Este migration remove a sincronização automática entre o sistema de gorjetas 
  e o sistema de contas a pagar, permitindo que as gorjetas sejam tratadas 
  apenas como registros de controle e cálculo.

  ## Alterações

  1. **Triggers Removidos**
     - `trg_sincronizar_gorjeta_adicional` na tabela `gorjetas_adicionais`
     - `trg_sincronizar_gorjeta_conta_pagar` na tabela `pagamentos_gorjeta`
     - `trg_sincronizar_conta_gorjeta` na tabela `contas_pagar`
     - `trg_remover_conta_gorjeta` na tabela `pagamentos_gorjeta`

  2. **Objetivo**
     - Gorjetas serão apenas para cálculo e controle interno
     - Pagamentos de gorjetas serão lançados manualmente no financeiro quando necessário
     - Remove dependência automática entre módulos RH e Financeiro

  ## Nota
  - Os dados existentes serão preservados
  - As tabelas continuam existindo, apenas sem sincronização automática
*/

-- Remover trigger de sincronização na tabela gorjetas_adicionais
DROP TRIGGER IF EXISTS trg_sincronizar_gorjeta_adicional ON gorjetas_adicionais;

-- Remover trigger de sincronização na tabela pagamentos_gorjeta
DROP TRIGGER IF EXISTS trg_sincronizar_gorjeta_conta_pagar ON pagamentos_gorjeta;

-- Remover trigger de sincronização na tabela contas_pagar
DROP TRIGGER IF EXISTS trg_sincronizar_conta_gorjeta ON contas_pagar;

-- Remover trigger de remoção na tabela pagamentos_gorjeta
DROP TRIGGER IF EXISTS trg_remover_conta_gorjeta ON pagamentos_gorjeta;

-- Comentar as funções relacionadas (mantê-las caso sejam necessárias no futuro)
COMMENT ON FUNCTION trg_sincronizar_gorjeta_adicional() IS 'DESATIVADA: Função de sincronização automática de gorjetas adicionais com contas a pagar';
COMMENT ON FUNCTION sincronizar_gorjeta_conta_pagar() IS 'DESATIVADA: Função de sincronização automática de pagamentos de gorjeta com contas a pagar';
COMMENT ON FUNCTION sincronizar_conta_gorjeta() IS 'DESATIVADA: Função de sincronização automática de contas a pagar com gorjetas';
COMMENT ON FUNCTION remover_conta_gorjeta() IS 'DESATIVADA: Função de remoção automática de contas de gorjeta';

-- Adicionar comentário explicativo nas tabelas afetadas
COMMENT ON TABLE gorjetas_adicionais IS 'Gorjetas adicionais para controle e cálculo interno. Não sincroniza automaticamente com o financeiro.';
COMMENT ON TABLE pagamentos_gorjeta IS 'Pagamentos de gorjeta para controle interno. Pagamentos reais devem ser lançados manualmente no financeiro.';