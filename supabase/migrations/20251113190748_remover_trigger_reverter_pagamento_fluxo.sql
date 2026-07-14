/*
  # Remover trigger que causa conflito com CASCADE

  1. Problema Identificado
    - Trigger `trg_reverter_pagamento_fluxo` é BEFORE DELETE no fluxo_caixa
    - Ele tenta excluir manualmente pagamentos_contas
    - Mas CASCADE já faz isso automaticamente quando excluímos conta_pagar
    - Isso causa: "tuple to be deleted was already modified by an operation triggered by the current command"

  2. Fluxo de Exclusão com CASCADE (correto)
    - Usuário exclui conta_pagar
    - CASCADE exclui automaticamente pagamentos_contas
    - CASCADE exclui automaticamente fluxo_caixa
    - Sem conflitos, sem triggers duplicados

  3. Solução
    - Remover trigger `trg_reverter_pagamento_fluxo` completamente
    - CASCADE já garante a exclusão em cascata na ordem correta
    - Triggers AFTER DELETE podem ser mantidos para lógica de negócio (como atualizar status)
*/

-- Remover o trigger que causa conflito
DROP TRIGGER IF EXISTS trg_reverter_pagamento_fluxo ON fluxo_caixa;

-- A função pode ser mantida para uso futuro, mas não será mais chamada automaticamente
COMMENT ON FUNCTION reverter_pagamento_ao_excluir_fluxo() IS 
'DEPRECATED: Esta função não é mais usada. CASCADE nas foreign keys cuida da exclusão automaticamente.';
