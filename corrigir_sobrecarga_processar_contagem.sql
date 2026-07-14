/*
  # Corrigir sobrecarga da função processar_contagem_estoque

  1. Problema
    - Existem duas versões da função com tipos diferentes para p_usuario_id
    - PostgreSQL não consegue escolher entre text e uuid

  2. Solução
    - Dropar todas as versões existentes
    - Recriar apenas a versão correta com uuid

  3. Como executar
    - Abra o SQL Editor no Supabase Dashboard
    - Cole este script completo
    - Execute
*/

-- Dropar todas as versões existentes da função
DROP FUNCTION IF EXISTS processar_contagem_estoque(uuid, text);
DROP FUNCTION IF EXISTS processar_contagem_estoque(uuid, uuid);

-- Recriar a função com a assinatura correta (uuid)
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
      AND ci.diferenca != 0
      AND ci.contado = true  -- Apenas itens que foram efetivamente contados
  LOOP
    -- Criar movimentação de ajuste
    INSERT INTO movimentacoes_estoque (
      estoque_id,
      item_estoque_id,
      tipo_movimentacao,
      quantidade,
      valor_unitario,
      valor_total,
      data_movimentacao,
      origem,
      descricao,
      criado_por
    ) VALUES (
      v_contagem.estoque_id,
      v_item.item_estoque_id,
      CASE
        WHEN v_item.diferenca > 0 THEN 'entrada'
        ELSE 'saida'
      END,
      ABS(v_item.diferenca),
      v_item.valor_unitario,
      ABS(v_item.valor_diferenca),
      now(),
      'ajuste_contagem',
      format('Ajuste de contagem - %s (%s) - Diferença: %s',
        v_item.item_nome,
        v_item.item_codigo,
        v_item.diferenca
      ),
      p_usuario_id
    );

    v_total_ajustes := v_total_ajustes + 1;
  END LOOP;

  -- Atualizar status da contagem
  UPDATE contagens_estoque
  SET
    status = 'processada',
    processada_em = now()
  WHERE id = p_contagem_id;

  RETURN json_build_object(
    'success', true,
    'message', format('%s ajustes de estoque criados com sucesso', v_total_ajustes),
    'total_ajustes', v_total_ajustes
  );
END;
$$;
