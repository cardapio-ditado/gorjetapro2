/*
  # Ajustar trigger para usar quantidade correta das requisições
  
  1. Changes
    - Ajusta a função para usar quantidade_entregue, ou quantidade_aprovada, ou quantidade_solicitada
    - Prioriza: quantidade_entregue > quantidade_aprovada > quantidade_solicitada
*/

CREATE OR REPLACE FUNCTION processar_requisicao_interna()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item_requisicao RECORD;
  quantidade_a_processar numeric;
BEGIN
  -- Processar apenas quando status muda para 'concluido'
  IF NEW.status = 'concluido' AND (OLD.status IS NULL OR OLD.status != 'concluido') THEN
    
    -- Loop pelos itens da requisição
    FOR item_requisicao IN 
      SELECT 
        item_id,
        quantidade_solicitada,
        quantidade_aprovada,
        quantidade_entregue
      FROM requisicoes_internas_itens
      WHERE requisicao_id = NEW.id
    LOOP
      
      -- Determinar quantidade a processar (prioridade: entregue > aprovada > solicitada)
      quantidade_a_processar := COALESCE(
        NULLIF(item_requisicao.quantidade_entregue, 0),
        NULLIF(item_requisicao.quantidade_aprovada, 0),
        item_requisicao.quantidade_solicitada
      );
      
      -- Validar: apenas processar se quantidade > 0
      IF COALESCE(quantidade_a_processar, 0) > 0 THEN
        
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
          quantidade_a_processar,
          COALESCE(ie.custo_medio, 0),
          quantidade_a_processar * COALESCE(ie.custo_medio, 0),
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
