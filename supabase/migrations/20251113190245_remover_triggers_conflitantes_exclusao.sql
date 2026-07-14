/*
  # Remover triggers BEFORE DELETE que conflitam com CASCADE

  1. Problema
    - Trigger `trg_excluir_lancamentos_conta` tenta excluir manualmente pagamentos e fluxo_caixa
    - Mas agora temos ON DELETE CASCADE configurado nas foreign keys
    - Isso causa erro: "tuple to be deleted was already modified by an operation triggered by the current command"
    
  2. Solução
    - Remover trigger `trg_excluir_lancamentos_conta` (CASCADE já faz o trabalho)
    - Manter trigger `trg_remover_conta_gorjeta` mas converter para AFTER DELETE
    - CASCADE cuida das exclusões automaticamente
  
  3. Comportamento após a correção
    - Ao excluir conta_pagar:
      1. CASCADE exclui automaticamente pagamentos_contas
      2. CASCADE exclui automaticamente fluxo_caixa
      3. AFTER trigger atualiza status da gorjeta se necessário
*/

-- 1. Remover trigger que tenta excluir manualmente (CASCADE já faz isso)
DROP TRIGGER IF EXISTS trg_excluir_lancamentos_conta ON contas_pagar;

-- 2. Remover o trigger antigo de gorjeta
DROP TRIGGER IF EXISTS trg_remover_conta_gorjeta ON contas_pagar;

-- 3. Recriar trigger de gorjeta como AFTER DELETE (só atualiza status, não exclui)
CREATE TRIGGER trg_remover_conta_gorjeta
AFTER DELETE ON contas_pagar
FOR EACH ROW
EXECUTE FUNCTION remover_conta_gorjeta();

-- 4. Verificar se há triggers similares em músicos
DROP TRIGGER IF EXISTS trg_excluir_pagamentos_musico ON musicos;

COMMENT ON TRIGGER trg_remover_conta_gorjeta ON contas_pagar IS 
'AFTER DELETE: Atualiza status de gorjetas quando conta é excluída. Não exclui nada pois CASCADE já cuida disso.';
