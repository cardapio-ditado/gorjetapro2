/*
  # Permitir contagem parcial de estoque
  
  ## Problema
  Atualmente, itens que não são contados ficam com quantidade_contada = 0,
  o que gera diferenças negativas indesejadas. O sistema deve permitir
  contagem parcial, onde apenas itens efetivamente contados são considerados.
  
  ## Solução
  1. Modificar quantidade_contada para permitir NULL
  2. Atualizar colunas GENERATED para considerar NULL como "não contado"
  3. Modificar funções para ignorar itens não contados (NULL)
  4. Atualizar itens existentes com quantidade 0 para NULL se não foram contados
  
  ## Comportamento Esperado
  - NULL = item não foi contado (ignorar)
  - 0 = item foi contado e encontrado zerado (considerar diferença)
  - > 0 = item foi contado com quantidade (considerar)
*/

-- Passo 1: Remover colunas GENERATED existentes
ALTER TABLE contagens_estoque_itens 
  DROP COLUMN IF EXISTS diferenca,
  DROP COLUMN IF EXISTS valor_diferenca;

-- Passo 2: Modificar quantidade_contada para permitir NULL
ALTER TABLE contagens_estoque_itens 
  ALTER COLUMN quantidade_contada DROP NOT NULL,
  ALTER COLUMN quantidade_contada DROP DEFAULT;

-- Passo 3: Recriar colunas GENERATED que ignoram NULL
ALTER TABLE contagens_estoque_itens
  ADD COLUMN diferenca decimal(15,3) GENERATED ALWAYS AS (
    CASE 
      WHEN quantidade_contada IS NULL THEN NULL
      ELSE quantidade_contada - quantidade_sistema
    END
  ) STORED;

ALTER TABLE contagens_estoque_itens
  ADD COLUMN valor_diferenca decimal(15,2) GENERATED ALWAYS AS (
    CASE 
      WHEN quantidade_contada IS NULL THEN NULL
      ELSE (quantidade_contada - quantidade_sistema) * valor_unitario
    END
  ) STORED;

-- Passo 4: Atualizar itens existentes que não foram realmente contados
-- (contagens em andamento com quantidade = 0 devem virar NULL)
UPDATE contagens_estoque_itens
SET quantidade_contada = NULL
WHERE quantidade_contada = 0
  AND contagem_id IN (
    SELECT id FROM contagens_estoque 
    WHERE status = 'em_andamento'
  );

-- Passo 5: Atualizar função finalizar_contagem_estoque
CREATE OR REPLACE FUNCTION finalizar_contagem_estoque(p_contagem_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_itens integer;
  v_total_diferencas integer;
  v_valor_total decimal(15,2);
  v_result json;
BEGIN
  -- Calcular totais (considerar apenas itens efetivamente contados)
  SELECT
    COUNT(*) FILTER (WHERE quantidade_contada IS NOT NULL),
    COUNT(*) FILTER (WHERE quantidade_contada IS NOT NULL AND diferenca != 0),
    COALESCE(SUM(valor_diferenca) FILTER (WHERE quantidade_contada IS NOT NULL), 0)
  INTO v_total_itens, v_total_diferencas, v_valor_total
  FROM contagens_estoque_itens
  WHERE contagem_id = p_contagem_id;

  -- Atualizar contagem
  UPDATE contagens_estoque
  SET
    status = 'finalizada',
    finalizado_em = now(),
    total_itens_contados = v_total_itens,
    total_diferencas = v_total_diferencas,
    valor_total_diferencas = v_valor_total
  WHERE id = p_contagem_id
    AND status = 'em_andamento';

  -- Retornar resultado
  SELECT json_build_object(
    'success', true,
    'total_itens', v_total_itens,
    'total_diferencas', v_total_diferencas,
    'valor_total_diferencas', v_valor_total
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Passo 6: Atualizar função processar_contagem_estoque
-- (já filtra por diferenca != 0, mas adicionar segurança extra)
CREATE OR REPLACE FUNCTION processar_contagem_estoque(
  p_contagem_id uuid,
  p_usuario_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_total_ajustes integer := 0;
  v_contagem RECORD;
BEGIN
  -- Buscar dados da contagem
  SELECT * INTO v_contagem
  FROM contagens_estoque
  WHERE id = p_contagem_id AND status = 'finalizada';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não encontrada ou não finalizada');
  END IF;

  -- Processar cada item com diferença (apenas itens contados)
  FOR v_item IN
    SELECT
      ci.*,
      ie.nome as item_nome,
      ie.codigo as item_codigo
    FROM contagens_estoque_itens ci
    JOIN itens_estoque ie ON ie.id = ci.item_estoque_id
    WHERE ci.contagem_id = p_contagem_id
      AND ci.quantidade_contada IS NOT NULL  -- Apenas itens efetivamente contados
      AND ci.diferenca != 0
  LOOP
    -- Criar movimentação de ajuste
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
      criado_por
    ) VALUES (
      CASE WHEN v_item.diferenca < 0 THEN v_contagem.estoque_id ELSE NULL END,
      CASE WHEN v_item.diferenca > 0 THEN v_contagem.estoque_id ELSE NULL END,
      v_item.item_estoque_id,
      CASE WHEN v_item.diferenca > 0 THEN 'entrada' ELSE 'saida' END,
      ABS(v_item.diferenca),
      v_item.valor_unitario,
      ABS(v_item.valor_diferenca),
      v_contagem.data_contagem,
      CONCAT('Ajuste de contagem - Diferença: ', v_item.diferenca),
      CONCAT(
        'Contagem física: ', v_item.quantidade_contada,
        ' | Sistema: ', v_item.quantidade_sistema,
        ' | Item: ', v_item.item_nome,
        ' (', COALESCE(v_item.item_codigo, ''), ')',
        CASE WHEN v_item.observacao IS NOT NULL 
          THEN ' | Obs: ' || v_item.observacao 
          ELSE '' 
        END
      ),
      p_usuario_id
    );
    
    v_total_ajustes := v_total_ajustes + 1;
  END LOOP;

  -- Marcar contagem como processada
  UPDATE contagens_estoque
  SET 
    status = 'processada',
    processado_em = now()
  WHERE id = p_contagem_id;

  RETURN json_build_object(
    'success', true,
    'message', format('%s ajustes processados com sucesso', v_total_ajustes),
    'total_ajustes', v_total_ajustes
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION finalizar_contagem_estoque(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION processar_contagem_estoque(uuid, uuid) TO authenticated, anon;

-- Comentários explicativos
COMMENT ON COLUMN contagens_estoque_itens.quantidade_contada IS 
  'Quantidade contada fisicamente. NULL = não contado, 0 = contado e zerado, >0 = contado com quantidade';

COMMENT ON COLUMN contagens_estoque_itens.diferenca IS 
  'Diferença calculada. NULL se item não foi contado, caso contrário quantidade_contada - quantidade_sistema';

COMMENT ON COLUMN contagens_estoque_itens.valor_diferenca IS 
  'Valor da diferença. NULL se item não foi contado, caso contrário diferenca * valor_unitario';