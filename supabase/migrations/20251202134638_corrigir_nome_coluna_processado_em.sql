/*
  # Corrigir nome da coluna na função processar_contagem_estoque

  1. Problema
    - Função tentava atualizar coluna "processada_em" que não existe
    - Coluna correta é "processado_em"
    
  2. Solução
    - Ajustar UPDATE para usar nome correto da coluna
    
  3. Segurança
    - Mantém todas as outras funcionalidades
*/

DROP FUNCTION IF EXISTS processar_contagem_estoque(uuid, text);

CREATE OR REPLACE FUNCTION processar_contagem_estoque(
  p_contagem_id uuid,
  p_usuario_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_movimentacao_id uuid;
  v_total_ajustes integer := 0;
  v_contagem RECORD;
  v_usuario_uuid uuid;
BEGIN
  -- Validar e converter usuário para UUID se possível
  BEGIN
    IF p_usuario_id IS NOT NULL AND p_usuario_id != 'temp-master' AND p_usuario_id != '' THEN
      v_usuario_uuid := p_usuario_id::uuid;
    ELSE
      v_usuario_uuid := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_usuario_uuid := NULL;
  END;

  -- Buscar dados da contagem
  SELECT * INTO v_contagem
  FROM contagens_estoque
  WHERE id = p_contagem_id AND status = 'finalizada';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não encontrada ou não finalizada');
  END IF;

  -- Processar cada item com diferença
  FOR v_item IN
    SELECT
      ci.*,
      ie.nome as item_nome,
      ie.codigo as item_codigo
    FROM contagens_estoque_itens ci
    JOIN itens_estoque ie ON ie.id = ci.item_estoque_id
    WHERE ci.contagem_id = p_contagem_id
      AND ci.diferenca != 0
  LOOP
    -- Criar movimentação de ajuste
    -- Para entrada: produto ENTRA no estoque (estoque_destino_id)
    -- Para saída: produto SAI do estoque (estoque_origem_id)
    INSERT INTO movimentacoes_estoque (
      estoque_origem_id,
      estoque_destino_id,
      item_id,
      tipo_movimentacao,
      quantidade,
      custo_unitario,
      custo_total,
      data_movimentacao,
      origem_tipo,
      motivo,
      observacoes,
      criado_por
    ) VALUES (
      CASE WHEN v_item.diferenca < 0 THEN v_contagem.estoque_id ELSE NULL END,  -- saída
      CASE WHEN v_item.diferenca > 0 THEN v_contagem.estoque_id ELSE NULL END,  -- entrada
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
      format('Ajuste de contagem - Diferença: %s', v_item.diferenca),
      format('Contagem física: %s | Sistema: %s | Item: %s (%s)',
        v_item.quantidade_contada,
        v_item.quantidade_sistema,
        v_item.item_nome,
        v_item.item_codigo
      ),
      v_usuario_uuid
    )
    RETURNING id INTO v_movimentacao_id;

    v_total_ajustes := v_total_ajustes + 1;
  END LOOP;

  -- Atualizar status da contagem (NOME CORRETO DA COLUNA: processado_em)
  UPDATE contagens_estoque
  SET 
    status = 'processada',
    processado_em = now()
  WHERE id = p_contagem_id;

  RETURN json_build_object(
    'success', true,
    'message', format('%s ajustes de estoque criados com sucesso', v_total_ajustes),
    'total_ajustes', v_total_ajustes
  );
END;
$$;