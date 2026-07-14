/*
  # Correções críticas na contagem de estoque

  ## Problemas corrigidos:

  1. bulk_import_contagem_itens sempre mostra TODOS os itens ativos (saldo zero incluído)
     - O parâmetro p_incluir_sem_saldo não deveria excluir itens — a contagem física
       precisa listar tudo para que o operador confirme que o item realmente está zerado
     - Usa calcular_saldo_item_estoque() para mostrar saldo real (não o cache)

  2. processar_contagem_estoque usa idempotency_key nas movimentações criadas
     - Formato: 'contagem_{contagem_id}_{item_id}'
     - Previne duplo processamento se chamado duas vezes

  3. quantidade_sistema na contagem agora usa o saldo calculado real, não o cache
*/

-- =============================================
-- Corrigir bulk_import_contagem_itens
-- SEMPRE inclui todos os itens ativos do estoque
-- Usa saldo calculado real (não o cache)
-- =============================================
CREATE OR REPLACE FUNCTION bulk_import_contagem_itens(
  p_contagem_id       UUID,
  p_estoque_id        UUID,
  p_incluir_sem_saldo BOOLEAN DEFAULT TRUE  -- ignorado: sempre inclui todos
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_inserido INTEGER := 0;
  v_contagem_status TEXT;
BEGIN
  SELECT status INTO v_contagem_status
  FROM contagens_estoque WHERE id = p_contagem_id;

  IF v_contagem_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não encontrada');
  END IF;

  IF v_contagem_status != 'em_andamento' THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não está em andamento');
  END IF;

  -- Inserir TODOS os itens ativos do estoque, incluindo os com saldo zero/negativo
  -- Usa calcular_saldo_item_estoque() para saldo real (não o campo cache)
  INSERT INTO contagens_estoque_itens (
    contagem_id, item_estoque_id, quantidade_sistema, valor_unitario
  )
  SELECT
    p_contagem_id,
    ie.id,
    calcular_saldo_item_estoque(ie.id, p_estoque_id),  -- saldo REAL calculado
    COALESCE(ie.custo_medio, 0)
  FROM itens_estoque ie
  WHERE ie.status = 'ativo'
    -- Sem filtro de estoque_nativo_id: mostrar todos os itens ativos do sistema
    AND NOT EXISTS (
      SELECT 1 FROM contagens_estoque_itens cei
      WHERE cei.contagem_id = p_contagem_id AND cei.item_estoque_id = ie.id
    )
  ORDER BY ie.nome;

  GET DIAGNOSTICS v_total_inserido = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'total_inserido', v_total_inserido
  );
END;
$$;

-- =============================================
-- Corrigir processar_contagem_estoque com idempotency_key
-- =============================================
CREATE OR REPLACE FUNCTION processar_contagem_estoque(
  p_contagem_id UUID,
  p_usuario_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contagem           RECORD;
  v_item               RECORD;
  v_saldo_real         NUMERIC;
  v_diferenca          NUMERIC;
  v_tipo_mov           TEXT;
  v_qtd_mov            NUMERIC;
  v_mov_id             UUID;
  v_chave_idempotency  TEXT;
  v_ja_existe          BOOLEAN;
  v_total_ajustes      INTEGER := 0;
  v_total_sem_diff     INTEGER := 0;
BEGIN
  -- Buscar e travar contagem
  SELECT * INTO v_contagem
  FROM contagens_estoque
  WHERE id = p_contagem_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contagem não encontrada');
  END IF;

  IF v_contagem.status NOT IN ('em_andamento', 'finalizada') THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Contagem não pode ser processada. Status atual: ' || v_contagem.status);
  END IF;

  -- Processar cada item que foi contado
  FOR v_item IN
    SELECT *
    FROM contagens_estoque_itens
    WHERE contagem_id = p_contagem_id
      AND quantidade_contada IS NOT NULL
  LOOP
    -- Calcular saldo real atual (não o snapshot da abertura)
    v_saldo_real := calcular_saldo_item_estoque(v_item.item_estoque_id, v_contagem.estoque_id);
    v_diferenca  := v_item.quantidade_contada - v_saldo_real;

    IF ABS(v_diferenca) < 0.001 THEN
      v_total_sem_diff := v_total_sem_diff + 1;
      CONTINUE;
    END IF;

    -- Determinar tipo de movimentação
    IF v_diferenca > 0 THEN
      v_tipo_mov := 'entrada';
      v_qtd_mov  := v_diferenca;
    ELSE
      v_tipo_mov := 'saida';
      v_qtd_mov  := ABS(v_diferenca);
    END IF;

    -- Idempotência: uma movimentação de ajuste por item/contagem
    v_chave_idempotency := 'contagem_' || p_contagem_id::TEXT || '_' || v_item.item_estoque_id::TEXT;

    SELECT EXISTS(
      SELECT 1 FROM movimentacoes_estoque
      WHERE idempotency_key = v_chave_idempotency
    ) INTO v_ja_existe;

    IF v_ja_existe THEN
      v_total_ajustes := v_total_ajustes + 1;
      CONTINUE;
    END IF;

    -- Criar movimentação de ajuste
    INSERT INTO movimentacoes_estoque (
      item_id,
      tipo_movimentacao,
      origem_tipo,
      quantidade,
      estoque_origem_id,
      estoque_destino_id,
      custo_unitario,
      custo_total,
      data_movimentacao,
      motivo,
      observacoes,
      criado_por,
      criado_em,
      origem_id,
      idempotency_key
    ) VALUES (
      v_item.item_estoque_id,
      v_tipo_mov,
      'contagem',
      v_qtd_mov,
      CASE WHEN v_tipo_mov = 'saida'    THEN v_contagem.estoque_id ELSE NULL END,
      CASE WHEN v_tipo_mov = 'entrada'  THEN v_contagem.estoque_id ELSE NULL END,
      COALESCE(v_item.valor_unitario, 0),
      v_qtd_mov * COALESCE(v_item.valor_unitario, 0),
      v_contagem.data_contagem::DATE,
      'Ajuste de contagem física',
      CONCAT(
        'Contagem: ', p_contagem_id::TEXT,
        ' | Contado: ', v_item.quantidade_contada,
        ' | Sistema: ', v_saldo_real,
        ' | Diff: ', v_diferenca
      ),
      COALESCE(p_usuario_id, v_contagem.criado_por),
      NOW(),
      p_contagem_id,
      v_chave_idempotency
    )
    RETURNING id INTO v_mov_id;

    -- Registrar ajuste
    INSERT INTO contagens_estoque_ajustes (
      contagem_id, contagem_item_id,
      tipo_ajuste, quantidade_ajustada,
      motivo, movimentacao_id, criado_por
    ) VALUES (
      p_contagem_id,
      v_item.id,
      CASE WHEN v_diferenca > 0 THEN 'sobra' ELSE 'perda' END,
      v_qtd_mov,
      'Ajuste automático por contagem física',
      v_mov_id,
      COALESCE(p_usuario_id, v_contagem.criado_por)
    )
    ON CONFLICT DO NOTHING;

    v_total_ajustes := v_total_ajustes + 1;
  END LOOP;

  -- Marcar contagem como processada
  UPDATE contagens_estoque
  SET status        = 'processada',
      processado_em = NOW()
  WHERE id = p_contagem_id;

  RETURN jsonb_build_object(
    'success',         true,
    'total_ajustes',   v_total_ajustes,
    'total_sem_diff',  v_total_sem_diff
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_import_contagem_itens(UUID, UUID, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION processar_contagem_estoque(UUID, UUID) TO anon, authenticated;
