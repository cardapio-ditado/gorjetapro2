/*
  # Criar Trigger para Excluir Contas a Pagar ao Excluir Músico
  
  1. Objetivo
    - Quando um músico (atração) for excluído, todas as suas contas a pagar relacionadas devem ser excluídas automaticamente
  
  2. Implementação
    - Trigger que executa ANTES da exclusão do músico
    - Exclui todas as contas a pagar vinculadas ao fornecedor do músico
    - Garante integridade referencial
  
  3. Segurança
    - Apenas para fornecedores do tipo 'musico'
    - Exclui apenas contas relacionadas ao fornecedor específico
*/

-- Função para excluir contas a pagar ao excluir músico
CREATE OR REPLACE FUNCTION excluir_contas_pagar_musico()
RETURNS TRIGGER AS $$
BEGIN
  -- Excluir todas as contas a pagar relacionadas ao fornecedor do músico que está sendo excluído
  DELETE FROM contas_pagar
  WHERE fornecedor_id = OLD.fornecedor_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger na tabela musicos para executar antes da exclusão
DROP TRIGGER IF EXISTS trigger_excluir_contas_pagar_musico ON musicos;

CREATE TRIGGER trigger_excluir_contas_pagar_musico
  BEFORE DELETE ON musicos
  FOR EACH ROW
  EXECUTE FUNCTION excluir_contas_pagar_musico();