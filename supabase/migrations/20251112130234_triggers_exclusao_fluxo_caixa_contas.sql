/*
  # Triggers para exclusão de lançamentos e contas
  
  1. Funcionalidades
    - Ao excluir lançamento do fluxo_caixa vinculado a pagamento → excluir o pagamento e reverter status da conta
    - Ao excluir conta a pagar → excluir seus pagamentos e lançamentos no fluxo de caixa
    - Manter integridade referencial e consistência dos dados
  
  2. Comportamento
    a) Exclusão de lançamento no fluxo_caixa:
       - Busca o pagamento vinculado (via pagamento_id)
       - Exclui o registro em pagamentos_contas
       - Trigger em pagamentos_contas atualiza automaticamente o status da conta
    
    b) Exclusão de conta a pagar:
       - Exclui todos os pagamentos vinculados
       - Exclui todos os lançamentos no fluxo_caixa vinculados
       - Garante que não fique lixo no banco
  
  3. Segurança
    - BEFORE DELETE para garantir execução antes da exclusão
    - Tratamento de erros com RAISE
    - Mantém auditoria através dos triggers existentes
*/

-- Função para reverter pagamento ao excluir lançamento do fluxo de caixa
CREATE OR REPLACE FUNCTION reverter_pagamento_ao_excluir_fluxo()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o lançamento tem pagamento_id vinculado, excluir o pagamento
  IF OLD.pagamento_id IS NOT NULL THEN
    RAISE NOTICE 'Excluindo pagamento % vinculado ao lançamento %', OLD.pagamento_id, OLD.id;
    
    -- Excluir o pagamento (isso vai atualizar o status da conta automaticamente via trigger)
    DELETE FROM pagamentos_contas
    WHERE id = OLD.pagamento_id;
    
    RAISE NOTICE 'Pagamento excluído com sucesso. Status da conta será atualizado automaticamente.';
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger em fluxo_caixa para reverter pagamento
DROP TRIGGER IF EXISTS trg_reverter_pagamento_fluxo ON fluxo_caixa;
CREATE TRIGGER trg_reverter_pagamento_fluxo
  BEFORE DELETE ON fluxo_caixa
  FOR EACH ROW
  EXECUTE FUNCTION reverter_pagamento_ao_excluir_fluxo();

-- Função para excluir lançamentos ao excluir conta a pagar
CREATE OR REPLACE FUNCTION excluir_lancamentos_ao_excluir_conta()
RETURNS TRIGGER AS $$
DECLARE
  v_pagamentos_count INT;
  v_lancamentos_count INT;
BEGIN
  RAISE NOTICE 'Excluindo conta a pagar %: %', OLD.id, OLD.descricao;
  
  -- Contar pagamentos vinculados
  SELECT COUNT(*) INTO v_pagamentos_count
  FROM pagamentos_contas
  WHERE conta_pagar_id = OLD.id;
  
  -- Contar lançamentos no fluxo de caixa
  SELECT COUNT(*) INTO v_lancamentos_count
  FROM fluxo_caixa
  WHERE conta_pagar_id = OLD.id;
  
  RAISE NOTICE 'Conta tem % pagamentos e % lançamentos no fluxo', v_pagamentos_count, v_lancamentos_count;
  
  -- Excluir todos os lançamentos no fluxo_caixa vinculados a esta conta
  -- Importante: excluir ANTES dos pagamentos para evitar trigger reverter_pagamento
  DELETE FROM fluxo_caixa
  WHERE conta_pagar_id = OLD.id;
  
  RAISE NOTICE 'Excluídos % lançamentos do fluxo de caixa', v_lancamentos_count;
  
  -- Excluir todos os pagamentos vinculados a esta conta
  DELETE FROM pagamentos_contas
  WHERE conta_pagar_id = OLD.id;
  
  RAISE NOTICE 'Excluídos % pagamentos', v_pagamentos_count;
  RAISE NOTICE 'Conta a pagar % excluída com sucesso', OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger em contas_pagar para excluir lançamentos
DROP TRIGGER IF EXISTS trg_excluir_lancamentos_conta ON contas_pagar;
CREATE TRIGGER trg_excluir_lancamentos_conta
  BEFORE DELETE ON contas_pagar
  FOR EACH ROW
  EXECUTE FUNCTION excluir_lancamentos_ao_excluir_conta();

-- Comentários para documentação
COMMENT ON FUNCTION reverter_pagamento_ao_excluir_fluxo() IS 
'Ao excluir um lançamento do fluxo_caixa vinculado a um pagamento, exclui o pagamento e reverte o status da conta a pagar automaticamente';

COMMENT ON FUNCTION excluir_lancamentos_ao_excluir_conta() IS 
'Ao excluir uma conta a pagar, exclui automaticamente todos os pagamentos e lançamentos no fluxo de caixa vinculados';
