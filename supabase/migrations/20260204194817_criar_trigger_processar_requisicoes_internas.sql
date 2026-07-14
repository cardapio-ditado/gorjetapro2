/*
  # Criar trigger para processar requisições internas
  
  1. Changes
    - Cria função processar_requisicao_interna que:
      - Cria movimentações de transferência entre estoques
      - Diminui estoque de origem
      - Aumenta estoque de destino
    - Cria trigger que dispara quando requisição é concluída
*/

CREATE OR REPLACE FUNCTION processar_requisicao_interna()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item_requisicao RECORD;
BEGIN
  -- Processar apenas quando status muda para 'concluido'
  IF NEW.status = 'concluido' AND (OLD.status IS NULL OR OLD.status != 'concluido') THEN
    
    -- Loop pelos itens da requisição
    FOR item_requisicao IN 
      SELECT 
        item_id,
        quantidade_solicitada,
        quantidade_atendida
      FROM requisicoes_internas_itens
      WHERE requisicao_id = NEW.id
    LOOP
      
      -- Validar: apenas processar se quantidade atendida > 0
      IF item_requisicao.quantidade_atendida > 0 THEN
        
        -- Criar movimentação de transferência
        INSERT INTO movimentacoes_estoque (
          estoque_origem_id,
          estoque_destino_id,
          item_id,
          tipo_movimentacao,
          quantidade,
          custo_unitario,
          custo_total,
          data_movimentacao,
          motivo,
          observacoes,
          criado_por,
          criado_em,
          origem_id,
          origem_tipo
        )
        SELECT 
          NEW.estoque_origem_id,
          NEW.estoque_destino_id,
          item_requisicao.item_id,
          'transferencia',
          item_requisicao.quantidade_atendida,
          COALESCE(ie.custo_medio, 0),
          item_requisicao.quantidade_atendida * COALESCE(ie.custo_medio, 0),
          NEW.data_requisicao,
          'Transferência por requisição interna',
          CONCAT(
            'Requisição: ', NEW.numero_requisicao,
            ' - Solicitante: ', NEW.funcionario_nome,
            CASE 
              WHEN NEW.setor IS NOT NULL THEN CONCAT(' - Setor: ', NEW.setor)
              ELSE ''
            END,
            CASE 
              WHEN NEW.observacoes IS NOT NULL THEN CONCAT(' - ', NEW.observacoes)
              ELSE ''
            END
          ),
          NEW.concluido_por,
          NOW(),
          NEW.id,
          'requisicao'
        FROM itens_estoque ie
        WHERE ie.id = item_requisicao.item_id;
        
      END IF;
      
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger
DROP TRIGGER IF EXISTS trg_processar_requisicao_interna ON requisicoes_internas;
CREATE TRIGGER trg_processar_requisicao_interna
  AFTER UPDATE ON requisicoes_internas
  FOR EACH ROW
  EXECUTE FUNCTION processar_requisicao_interna();
