/*
  # Corrigir Referências ao Campo Status de Estoques

  ## Alterações

  Atualiza as funções que fazem referência ao campo 'ativo' para usar 'status' corretamente.
  
  - Campo correto: estoques.status (boolean)
  - Campo incorreto usado anteriormente: estoques.ativo
*/

-- Corrigir função reverter_estoque_producao
CREATE OR REPLACE FUNCTION reverter_estoque_producao()
RETURNS TRIGGER AS $$
DECLARE
  v_estoque_producao_id UUID;
  v_reserva RECORD;
  v_saldo RECORD;
BEGIN
  -- Buscar estoque de produção (corrigido para usar 'status')
  SELECT id INTO v_estoque_producao_id
  FROM estoques
  WHERE tipo = 'producao' AND status = true
  LIMIT 1;

  -- 1. REVERTER INSUMOS CONSUMIDOS (devolver ao estoque)
  IF OLD.status IN ('em_andamento', 'concluido', 'pausado') THEN
    
    FOR v_reserva IN 
      SELECT * FROM producao_reserva_insumos 
      WHERE producao_id = OLD.id 
      AND status_reserva = 'utilizado'
    LOOP
      UPDATE saldos_estoque
      SET quantidade_atual = quantidade_atual + v_reserva.quantidade_utilizada
      WHERE estoque_id = v_reserva.estoque_origem_id
      AND item_id = v_reserva.item_id;

      INSERT INTO movimentacoes_estoque (
        estoque_id,
        item_id,
        tipo_movimentacao,
        quantidade,
        motivo,
        referencia_tipo,
        referencia_id
      ) VALUES (
        v_reserva.estoque_origem_id,
        v_reserva.item_id,
        'entrada',
        v_reserva.quantidade_utilizada,
        'Estorno por exclusão de produção ' || OLD.lote_producao,
        'estorno_producao',
        OLD.id
      );
    END LOOP;

  END IF;

  -- 2. REVERTER ENTRADA DO PRODUTO FINAL
  IF OLD.status = 'concluido' AND OLD.quantidade_aprovada > 0 THEN
    
    DECLARE
      v_item_produto_id UUID;
      v_ficha_nome TEXT;
    BEGIN
      SELECT nome INTO v_ficha_nome
      FROM fichas_tecnicas
      WHERE id = OLD.ficha_id;

      SELECT id INTO v_item_produto_id
      FROM itens_estoque
      WHERE nome = v_ficha_nome
      AND tipo_item = 'produto_final'
      LIMIT 1;

      IF v_item_produto_id IS NOT NULL THEN
        UPDATE saldos_estoque
        SET quantidade_atual = GREATEST(0, quantidade_atual - OLD.quantidade_aprovada)
        WHERE estoque_id = COALESCE(OLD.estoque_destino_id, v_estoque_producao_id)
        AND item_id = v_item_produto_id;

        INSERT INTO movimentacoes_estoque (
          estoque_id,
          item_id,
          tipo_movimentacao,
          quantidade,
          motivo,
          referencia_tipo,
          referencia_id
        ) VALUES (
          COALESCE(OLD.estoque_destino_id, v_estoque_producao_id),
          v_item_produto_id,
          'saida',
          OLD.quantidade_aprovada,
          'Estorno de produto final por exclusão - Lote ' || OLD.lote_producao,
          'estorno_producao',
          OLD.id
        );
      END IF;
    END;

  END IF;

  -- 3. REVERTER TRANSFERÊNCIAS
  DECLARE
    v_transferencia RECORD;
  BEGIN
    FOR v_transferencia IN 
      SELECT * FROM producao_transferencias 
      WHERE producao_id = OLD.id 
      AND status_transferencia = 'concluida'
    LOOP
      UPDATE saldos_estoque
      SET quantidade_atual = GREATEST(0, quantidade_atual - v_transferencia.quantidade_transferida)
      WHERE estoque_id = v_transferencia.estoque_destino_id
      AND item_id = v_transferencia.item_id;

      UPDATE saldos_estoque
      SET quantidade_atual = quantidade_atual + v_transferencia.quantidade_transferida
      WHERE estoque_id = v_transferencia.estoque_origem_id
      AND item_id = v_transferencia.item_id;

      UPDATE producao_transferencias
      SET status_transferencia = 'cancelada'
      WHERE id = v_transferencia.id;

      INSERT INTO movimentacoes_estoque (
        estoque_id,
        item_id,
        tipo_movimentacao,
        quantidade,
        motivo,
        referencia_tipo,
        referencia_id
      ) VALUES 
      (
        v_transferencia.estoque_destino_id,
        v_transferencia.item_id,
        'saida',
        v_transferencia.quantidade_transferida,
        'Estorno de transferência - Exclusão de produção',
        'estorno_transferencia',
        v_transferencia.id
      ),
      (
        v_transferencia.estoque_origem_id,
        v_transferencia.item_id,
        'entrada',
        v_transferencia.quantidade_transferida,
        'Estorno de transferência - Exclusão de produção',
        'estorno_transferencia',
        v_transferencia.id
      );
    END LOOP;
  END;

  INSERT INTO producao_historico_status (
    producao_id,
    status_anterior,
    status_novo,
    observacoes
  ) VALUES (
    OLD.id,
    OLD.status,
    'excluido',
    'Produção excluída - Estoque revertido automaticamente'
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Corrigir função set_estoque_producao_default
CREATE OR REPLACE FUNCTION set_estoque_producao_default()
RETURNS TRIGGER AS $$
DECLARE
  v_estoque_producao_id UUID;
BEGIN
  -- Se não foi informado estoque destino, buscar o estoque de produção (corrigido para usar 'status')
  IF NEW.estoque_destino_id IS NULL THEN
    SELECT id INTO v_estoque_producao_id
    FROM estoques
    WHERE tipo = 'producao' AND status = true
    LIMIT 1;

    NEW.estoque_destino_id := v_estoque_producao_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
