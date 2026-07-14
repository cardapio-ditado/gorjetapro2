/*
  # Corrigir ambiguidade na função processar_contagem_estoque
  
  ## Problema
  Existem duas versões da função processar_contagem_estoque:
  - Uma com p_usuario_id TEXT
  - Outra com p_usuario_id UUID
  
  Isso causa erro: "Could not choose the best candidate function"
  
  ## Solução
  1. Remover TODAS as versões da função
  2. Recriar apenas a versão correta (UUID)
  3. Manter consistência com o restante do sistema
  
  ## Impacto
  - Remove ambiguidade
  - Mantém funcionalidade correta
  - Usa UUID conforme padrão do sistema
*/

-- Passo 1: Remover TODAS as versões existentes da função
DROP FUNCTION IF EXISTS processar_contagem_estoque(uuid, text);
DROP FUNCTION IF EXISTS processar_contagem_estoque(uuid, uuid);

-- Passo 2: Recriar a função com assinatura correta (UUID)
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

  -- Processar cada item com diferença (apenas itens efetivamente contados)
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

-- Passo 3: Conceder permissões
GRANT EXECUTE ON FUNCTION processar_contagem_estoque(uuid, uuid) TO authenticated, anon;

-- Passo 4: Adicionar comentário
COMMENT ON FUNCTION processar_contagem_estoque(uuid, uuid) IS 
  'Processa contagem finalizada e cria ajustes de estoque. Apenas itens efetivamente contados (quantidade_contada NOT NULL) são processados.';
