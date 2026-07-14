/*
  # Corrigir processamento de contagem para aceitar usuário temporário

  1. Alterações
    - Modifica função processar_contagem_estoque para aceitar p_usuario_id como TEXT
    - Só insere criado_por se for um UUID válido (não 'temp-master')
    - Evita erro "invalid input syntax for type uuid"
  
  2. Segurança
    - Mantém SECURITY DEFINER
    - Valida UUID antes de inserir
*/

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
    IF p_usuario_id IS NOT NULL AND p_usuario_id != 'temp-master' THEN
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
      v_usuario_uuid
    )
    RETURNING id INTO v_movimentacao_id;

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