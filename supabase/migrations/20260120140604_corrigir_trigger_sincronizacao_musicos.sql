/*
  # Corrigir Trigger de Sincronização de Músicos
  
  ## Problema
  O trigger de sincronização não estava disparando quando valor, valor_consumo 
  ou valor_adicional eram alterados, pois ele só monitorava valor_total_final.
  
  ## Solução
  Recriar o trigger para disparar também quando os campos de valores base são alterados.
  
  ## Alterações
  - Drop e recriação do trigger para incluir todos os campos de valores
*/

-- Drop trigger antigo
DROP TRIGGER IF EXISTS trg_sincronizar_musico_conta ON musicos;

-- Recriar trigger para disparar em todas as mudanças de valores
CREATE TRIGGER trg_sincronizar_musico_conta
    AFTER INSERT OR UPDATE OF valor, valor_consumo, valor_adicional, valor_total_final, fornecedor_id, nome, data_evento, status_pagamento
    ON musicos
    FOR EACH ROW
    EXECUTE FUNCTION sincronizar_musico_para_conta_pagar();
