/*
  # Reformular RPCs de Contagem de Estoque

  ## Descricao
  Melhoria completa das funcoes de contagem de estoque:
  - Nova RPC bulk_import_contagem_itens para importacao atomica de itens no servidor
  - Correcao do processar_contagem_estoque para popular tabela de auditoria
  - Correcao do finalizar_contagem_estoque para calcular totais corretamente
  - Nova RPC cancelar_contagem_estoque
  - Adicao de indices para performance

  ## Funcoes criadas/alteradas
  1. bulk_import_contagem_itens - Importacao atomica server-side
  2. processar_contagem_estoque - Agora popula contagens_estoque_ajustes
  3. finalizar_contagem_estoque - Recalcula totais corretamente
  4. cancelar_contagem_estoque - Nova funcao
  5. reabrir_contagem_estoque - Mantida com retorno json

  ## Indices adicionados
  - idx_contagens_itens_contados (parcial)
  - idx_contagens_ajustes_contagem
*/

CREATE INDEX IF NOT EXISTS idx_contagens_itens_contados
  ON contagens_estoque_itens(contagem_id)
  WHERE quantidade_contada IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contagens_ajustes_contagem
  ON contagens_estoque_ajustes(contagem_id);

-- Drop existing functions to allow return type change
DROP FUNCTION IF EXISTS finalizar_contagem_estoque(uuid);
DROP FUNCTION IF EXISTS processar_contagem_estoque(uuid, uuid);
DROP FUNCTION IF EXISTS processar_contagem_estoque(uuid, text);
DROP FUNCTION IF EXISTS reabrir_contagem_estoque(uuid);

-- =============================================
-- RPC: bulk_import_contagem_itens
-- =============================================
CREATE OR REPLACE FUNCTION bulk_import_contagem_itens(
  p_contagem_id uuid,
  p_estoque_id uuid,
  p_incluir_sem_saldo boolean DEFAULT true
)
RETURNS json AS $$
DECLARE
  v_total_inserido integer := 0;
  v_contagem_status text;
BEGIN
  SELECT status INTO v_contagem_status
  FROM contagens_estoque WHERE id = p_contagem_id;

  IF v_contagem_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não encontrada');
  END IF;

  IF v_contagem_status != 'em_andamento' THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não está em andamento');
  END IF;

  INSERT INTO contagens_estoque_itens (
    contagem_id, item_estoque_id, quantidade_sistema, valor_unitario
  )
  SELECT
    p_contagem_id,
    ie.id,
    COALESCE(se.quantidade_atual, 0),
    CASE
      WHEN COALESCE(se.quantidade_atual, 0) > 0
        THEN ROUND(COALESCE(se.valor_total, 0) / se.quantidade_atual, 4)
      ELSE COALESCE(ie.custo_medio, 0)
    END
  FROM itens_estoque ie
  LEFT JOIN saldos_estoque se ON se.item_id = ie.id AND se.estoque_id = p_estoque_id
  WHERE ie.status = 'ativo'
    AND (ie.estoque_nativo_id IS NULL OR ie.estoque_nativo_id = p_estoque_id)
    AND (p_incluir_sem_saldo = true OR COALESCE(se.quantidade_atual, 0) > 0)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: finalizar_contagem_estoque
-- =============================================
CREATE OR REPLACE FUNCTION finalizar_contagem_estoque(p_contagem_id uuid)
RETURNS json AS $$
DECLARE
  v_total_contados integer;
  v_total_diferencas integer;
  v_valor_total_diferencas numeric(15,2);
  v_status text;
BEGIN
  SELECT status INTO v_status FROM contagens_estoque WHERE id = p_contagem_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não encontrada');
  END IF;

  IF v_status != 'em_andamento' THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não está em andamento');
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE quantidade_contada IS NOT NULL),
    COUNT(*) FILTER (WHERE quantidade_contada IS NOT NULL AND diferenca != 0),
    COALESCE(SUM(ABS(valor_diferenca)) FILTER (WHERE quantidade_contada IS NOT NULL AND diferenca != 0), 0)
  INTO v_total_contados, v_total_diferencas, v_valor_total_diferencas
  FROM contagens_estoque_itens
  WHERE contagem_id = p_contagem_id;

  IF v_total_contados = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nenhum item foi contado');
  END IF;

  UPDATE contagens_estoque SET
    status = 'finalizada',
    finalizado_em = now(),
    total_itens_contados = v_total_contados,
    total_diferencas = v_total_diferencas,
    valor_total_diferencas = v_valor_total_diferencas
  WHERE id = p_contagem_id;

  RETURN json_build_object(
    'success', true,
    'total_contados', v_total_contados,
    'total_diferencas', v_total_diferencas,
    'valor_total_diferencas', v_valor_total_diferencas
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: processar_contagem_estoque (com audit trail)
-- =============================================
CREATE OR REPLACE FUNCTION processar_contagem_estoque(
  p_contagem_id uuid,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_contagem record;
  v_item record;
  v_mov_id uuid;
  v_total_ajustes integer := 0;
  v_tipo_ajuste text;
  v_valor_total_ajustes numeric(15,2) := 0;
BEGIN
  SELECT * INTO v_contagem
  FROM contagens_estoque
  WHERE id = p_contagem_id AND status = 'finalizada';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não encontrada ou não está finalizada');
  END IF;

  FOR v_item IN
    SELECT * FROM contagens_estoque_itens
    WHERE contagem_id = p_contagem_id
      AND quantidade_contada IS NOT NULL
      AND diferenca != 0
  LOOP
    IF v_item.diferenca < 0 THEN
      v_tipo_ajuste := 'perda';
    ELSIF v_item.diferenca > 0 THEN
      v_tipo_ajuste := 'sobra';
    ELSE
      v_tipo_ajuste := 'acerto';
    END IF;

    INSERT INTO movimentacoes_estoque (
      estoque_origem_id, estoque_destino_id, item_id,
      tipo_movimentacao, quantidade, custo_unitario, custo_total,
      data_movimentacao, motivo, observacoes, criado_por,
      origem_tipo, origem_id
    ) VALUES (
      CASE WHEN v_item.diferenca < 0 THEN v_contagem.estoque_id ELSE NULL END,
      CASE WHEN v_item.diferenca > 0 THEN v_contagem.estoque_id ELSE NULL END,
      v_item.item_estoque_id,
      CASE WHEN v_item.diferenca < 0 THEN 'saida' ELSE 'entrada' END,
      ABS(v_item.diferenca),
      v_item.valor_unitario,
      ABS(v_item.diferenca) * v_item.valor_unitario,
      now(),
      'Ajuste de inventário - Contagem',
      'Contagem #' || LEFT(p_contagem_id::text, 8),
      p_usuario_id,
      'contagem',
      p_contagem_id
    ) RETURNING id INTO v_mov_id;

    INSERT INTO contagens_estoque_ajustes (
      contagem_id, contagem_item_id, tipo_ajuste,
      quantidade_ajustada, motivo, movimentacao_id, criado_por
    ) VALUES (
      p_contagem_id, v_item.id, v_tipo_ajuste,
      v_item.diferenca,
      'Ajuste automático - Contagem de estoque',
      v_mov_id, p_usuario_id
    );

    v_total_ajustes := v_total_ajustes + 1;
    v_valor_total_ajustes := v_valor_total_ajustes + ABS(COALESCE(v_item.valor_diferenca, 0));
  END LOOP;

  UPDATE contagens_estoque SET
    status = 'processada',
    processado_em = now()
  WHERE id = p_contagem_id;

  RETURN json_build_object(
    'success', true,
    'message', v_total_ajustes || ' ajustes processados com sucesso',
    'total_ajustes', v_total_ajustes,
    'valor_total_ajustes', v_valor_total_ajustes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: reabrir_contagem_estoque
-- =============================================
CREATE OR REPLACE FUNCTION reabrir_contagem_estoque(p_contagem_id uuid)
RETURNS json AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM contagens_estoque WHERE id = p_contagem_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não encontrada');
  END IF;

  IF v_status != 'finalizada' THEN
    RETURN json_build_object('success', false, 'error', 'Apenas contagens finalizadas podem ser reabertas');
  END IF;

  UPDATE contagens_estoque SET
    status = 'em_andamento',
    finalizado_em = NULL,
    total_itens_contados = 0,
    total_diferencas = 0,
    valor_total_diferencas = 0
  WHERE id = p_contagem_id;

  RETURN json_build_object('success', true, 'message', 'Contagem reaberta com sucesso');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- RPC: cancelar_contagem_estoque (nova)
-- =============================================
CREATE OR REPLACE FUNCTION cancelar_contagem_estoque(p_contagem_id uuid)
RETURNS json AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM contagens_estoque WHERE id = p_contagem_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Contagem não encontrada');
  END IF;

  IF v_status = 'processada' THEN
    RETURN json_build_object('success', false, 'error', 'Contagens processadas não podem ser canceladas');
  END IF;

  UPDATE contagens_estoque SET
    status = 'cancelada'
  WHERE id = p_contagem_id;

  RETURN json_build_object('success', true, 'message', 'Contagem cancelada');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
