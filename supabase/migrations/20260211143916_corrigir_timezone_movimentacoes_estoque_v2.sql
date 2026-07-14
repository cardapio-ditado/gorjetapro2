/*
  # Corrigir timezone em movimentações de estoque
  
  1. Problema
    - Movimentações estão sendo registradas com data um dia anterior
    - Causa: now() retorna UTC, mas Brasil está em GMT-3
    
  2. Solução
    - Atualizar RPC processar_contagem_estoque para usar timezone America/Sao_Paulo
    - Atualizar outras RPCs que criam movimentações
    
  3. Impacto
    - Movimentações futuras serão registradas com data correta
    - Não altera dados históricos
*/

-- Drop e recriar função processar_contagem_estoque com timezone correto
DROP FUNCTION IF EXISTS processar_contagem_estoque(uuid, uuid);

CREATE FUNCTION processar_contagem_estoque(
  p_contagem_id uuid,
  p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contagem RECORD;
  v_item RECORD;
  v_tipo_ajuste text;
  v_mov_id uuid;
  v_total_itens int := 0;
  v_itens_ajustados int := 0;
  v_valor_total_ajustes numeric := 0;
BEGIN
  -- Buscar contagem
  SELECT * INTO v_contagem
  FROM contagens_estoque
  WHERE id = p_contagem_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contagem não encontrada';
  END IF;
  
  IF v_contagem.status != 'em_andamento' THEN
    RAISE EXCEPTION 'Contagem já foi processada ou não está em andamento';
  END IF;
  
  -- Processar cada item
  FOR v_item IN
    SELECT 
      ci.id,
      ci.item_estoque_id,
      ci.quantidade_contada,
      ci.saldo_sistema,
      ci.diferenca,
      ci.valor_unitario,
      ie.item_id
    FROM contagens_estoque_itens ci
    JOIN itens_estoque ie ON ci.item_estoque_id = ie.id
    WHERE ci.contagem_id = p_contagem_id
    AND ci.diferenca != 0
  LOOP
    v_total_itens := v_total_itens + 1;
    
    -- Definir tipo de ajuste
    IF v_item.diferenca < 0 THEN
      v_tipo_ajuste := 'falta';
    ELSIF v_item.diferenca > 0 THEN
      v_tipo_ajuste := 'sobra';
    ELSE
      v_tipo_ajuste := 'acerto';
    END IF;

    -- Criar movimentação com timezone correto
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
      timezone('America/Sao_Paulo', now()),
      'Ajuste de inventário - Contagem',
      'Contagem #' || LEFT(p_contagem_id::text, 8),
      p_usuario_id,
      'contagem',
      p_contagem_id
    ) RETURNING id INTO v_mov_id;

    -- Criar registro de ajuste
    INSERT INTO contagens_estoque_ajustes (
      contagem_id, contagem_item_id, tipo_ajuste,
      quantidade_ajustada, motivo, movimentacao_id, criado_por
    ) VALUES (
      p_contagem_id, v_item.id, v_tipo_ajuste,
      v_item.diferenca,
      'Ajuste automático - Contagem de estoque',
      v_mov_id, p_usuario_id
    );
    
    v_itens_ajustados := v_itens_ajustados + 1;
    v_valor_total_ajustes := v_valor_total_ajustes + (ABS(v_item.diferenca) * v_item.valor_unitario);
  END LOOP;
  
  -- Atualizar status da contagem
  UPDATE contagens_estoque
  SET 
    status = 'processada',
    processado_em = timezone('America/Sao_Paulo', now()),
    processado_por = p_usuario_id,
    total_ajustes = v_itens_ajustados,
    valor_ajustes = v_valor_total_ajustes,
    atualizado_em = timezone('America/Sao_Paulo', now())
  WHERE id = p_contagem_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_itens', v_total_itens,
    'itens_ajustados', v_itens_ajustados,
    'valor_total_ajustes', v_valor_total_ajustes
  );
END;
$$;

-- Corrigir função processar_entrada_compra também
CREATE OR REPLACE FUNCTION processar_entrada_compra(
  p_compra_id uuid,
  p_estoque_destino_id uuid,
  p_usuario_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_quantidade_recebida numeric;
BEGIN
  -- Loop pelos itens da compra
  FOR v_item IN
    SELECT 
      ci.id,
      ci.item_id,
      ci.item_nome,
      ci.quantidade,
      ci.quantidade_recebida,
      ci.custo_unitario,
      ie.id as item_estoque_id
    FROM compras_itens ci
    LEFT JOIN itens_estoque ie ON ie.item_id = ci.item_id AND ie.estoque_id = p_estoque_destino_id
    WHERE ci.compra_id = p_compra_id
  LOOP
    -- Usar quantidade recebida ou quantidade total
    v_quantidade_recebida := COALESCE(v_item.quantidade_recebida, v_item.quantidade);
    
    IF v_quantidade_recebida > 0 THEN
      -- Criar movimentação de entrada com timezone correto
      INSERT INTO movimentacoes_estoque (
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
        origem_tipo,
        origem_id
      ) VALUES (
        p_estoque_destino_id,
        v_item.item_estoque_id,
        'entrada',
        v_quantidade_recebida,
        v_item.custo_unitario,
        v_quantidade_recebida * v_item.custo_unitario,
        timezone('America/Sao_Paulo', now()),
        'Entrada por compra',
        'Compra recebida - ' || v_item.item_nome,
        p_usuario_id,
        'compra',
        p_compra_id
      );
    END IF;
  END LOOP;
END;
$$;

-- Corrigir função de requisições internas
CREATE OR REPLACE FUNCTION processar_requisicao_interna_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Apenas processar quando status muda para 'atendida'
  IF NEW.status = 'atendida' AND (OLD.status IS NULL OR OLD.status != 'atendida') THEN
    
    -- Loop pelos itens da requisição
    FOR v_item IN
      SELECT 
        ri.id,
        ri.item_estoque_id,
        ri.quantidade_solicitada,
        ri.quantidade_atendida,
        ie.item_id,
        ie.descricao as item_nome
      FROM requisicoes_internas_itens ri
      JOIN itens_estoque ie ON ri.item_estoque_id = ie.id
      WHERE ri.requisicao_id = NEW.id
      AND ri.quantidade_atendida > 0
    LOOP
      -- Verificar se já existe movimentação
      IF NOT EXISTS (
        SELECT 1 FROM movimentacoes_estoque
        WHERE origem_tipo = 'requisicao'
        AND origem_id = NEW.id
        AND item_id = v_item.item_estoque_id
      ) THEN
        -- Criar movimentação de saída com timezone correto
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
          origem_tipo,
          origem_id
        ) VALUES (
          NEW.estoque_origem_id,
          NEW.estoque_destino_id,
          v_item.item_estoque_id,
          'transferencia',
          v_item.quantidade_atendida,
          0,
          0,
          timezone('America/Sao_Paulo', now()),
          'Requisição Interna',
          'Requisição #' || LEFT(NEW.id::text, 8) || ' - ' || v_item.item_nome,
          NEW.atendido_por,
          'requisicao',
          NEW.id
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;
