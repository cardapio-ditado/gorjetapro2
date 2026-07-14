/*
  # Função para baixar insumos automaticamente na venda

  Cria função que:
  1. Recebe ID do item importado da venda
  2. Verifica se tem ficha técnica
  3. Se tipo_consumo = 'venda_direta', baixa todos os insumos
  4. Cria movimentação composta rastreável
  5. Atualiza saldos de estoque

  Uso: SELECT * FROM baixar_insumos_venda_automatica(item_importacao_id);
*/

CREATE OR REPLACE FUNCTION baixar_insumos_venda_automatica(
  p_item_importacao_id UUID
) RETURNS TABLE (
  sucesso BOOLEAN,
  movimentacao_composta_id UUID,
  total_movimentacoes INTEGER,
  mensagem TEXT
) AS $$
DECLARE
  v_item RECORD;
  v_ficha RECORD;
  v_ingrediente RECORD;
  v_composta_id UUID;
  v_movimentacao_id UUID;
  v_count INTEGER := 0;
  v_quantidade_consumo NUMERIC;
BEGIN
  -- 1. Buscar item importado
  SELECT
    ii.id,
    ii.item_estoque_id,
    ii.estoque_id,
    ii.quantidade,
    ie.ficha_tecnica_id,
    ie.nome as item_nome
  INTO v_item
  FROM itens_importacao_vendas ii
  JOIN itens_estoque ie ON ie.id = ii.item_estoque_id
  WHERE ii.id = p_item_importacao_id
    AND ii.status = 'mapeado'
    AND ii.movimentacao_id IS NULL; -- Ainda não processado

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Item não encontrado ou já processado';
    RETURN;
  END IF;

  -- 2. Verificar se tem ficha técnica
  IF v_item.ficha_tecnica_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Item não possui ficha técnica';
    RETURN;
  END IF;

  -- 3. Buscar ficha técnica
  SELECT * INTO v_ficha
  FROM fichas_tecnicas
  WHERE id = v_item.ficha_tecnica_id
    AND ativo = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Ficha técnica não encontrada ou inativa';
    RETURN;
  END IF;

  -- 4. Verificar tipo de consumo
  IF v_ficha.tipo_consumo != 'venda_direta' THEN
    RETURN QUERY SELECT
      false,
      NULL::UUID,
      0,
      'Ficha tipo ' || v_ficha.tipo_consumo || ' - não processa na venda';
    RETURN;
  END IF;

  -- 5. Criar movimentação composta
  INSERT INTO movimentacoes_compostas (
    tipo,
    referencia_id,
    referencia_tipo,
    descricao
  ) VALUES (
    'venda',
    p_item_importacao_id,
    'venda_importada',
    'Consumo automático: ' || v_item.item_nome || ' (' || v_item.quantidade || 'x)'
  ) RETURNING id INTO v_composta_id;

  -- 6. Para cada ingrediente da ficha, criar movimentação de saída
  FOR v_ingrediente IN
    SELECT
      fi.item_id,
      fi.quantidade as qtd_por_porcao,
      fi.unidade,
      ie.nome as ingrediente_nome
    FROM ficha_ingredientes fi
    JOIN itens_estoque ie ON ie.id = fi.item_id
    WHERE fi.ficha_id = v_item.ficha_tecnica_id
  LOOP
    -- Calcular quantidade total consumida
    v_quantidade_consumo := v_ingrediente.qtd_por_porcao * v_item.quantidade;

    -- Criar movimentação de saída
    INSERT INTO movimentacoes_estoque (
      estoque_id,
      item_id,
      tipo,
      quantidade,
      documento,
      observacoes,
      criado_em
    ) VALUES (
      v_item.estoque_id,
      v_ingrediente.item_id,
      'saida',
      v_quantidade_consumo,
      'VENDA-' || p_item_importacao_id,
      'Consumo automático via ficha técnica: ' || v_ficha.nome ||
      ' (' || v_item.quantidade || ' porções)',
      now()
    ) RETURNING id INTO v_movimentacao_id;

    -- Adicionar à movimentação composta
    INSERT INTO movimentacoes_compostas_itens (
      composta_id,
      movimentacao_id,
      tipo_item
    ) VALUES (
      v_composta_id,
      v_movimentacao_id,
      'insumo'
    );

    v_count := v_count + 1;
  END LOOP;

  -- 7. Atualizar item importado
  UPDATE itens_importacao_vendas
  SET
    status = 'processado',
    processado_em = now(),
    movimentacao_id = v_composta_id -- Referencia a composta
  WHERE id = p_item_importacao_id;

  -- 8. Retornar resultado
  RETURN QUERY SELECT
    true,
    v_composta_id,
    v_count,
    'Sucesso: ' || v_count || ' insumos baixados do estoque';

EXCEPTION WHEN OTHERS THEN
  -- Rollback automático em caso de erro
  RETURN QUERY SELECT
    false,
    NULL::UUID,
    0,
    'Erro: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION baixar_insumos_venda_automatica IS
'Processa baixa automática de insumos para vendas com ficha técnica tipo venda_direta.
Uso: SELECT * FROM baixar_insumos_venda_automatica(item_importacao_id);';