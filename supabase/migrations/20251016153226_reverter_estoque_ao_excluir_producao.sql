/*
  # Reverter Estoque ao Excluir Produção

  ## Alterações

  ### 1. Função para Reverter Movimentações
  Cria função que reverte todas as movimentações de estoque quando uma produção é excluída:
  - Estorna insumos consumidos (devolve ao estoque)
  - Remove entrada do produto final
  - Reverte transferências realizadas
  - Mantém histórico para auditoria

  ### 2. Trigger para Exclusão de Produção
  Trigger automático que executa a função de reversão antes de excluir uma produção

  ### 3. Ajuste de Estoque Destino
  - Altera campo estoque_destino_id para usar automaticamente o estoque de produção
  - Adiciona valor padrão baseado no estoque tipo 'producao'
  - Produto final sempre entra no estoque de produção

  ### 4. Segurança
  - Mantém políticas RLS existentes
  - Registra todas as reversões no histórico
*/

-- 1. Função para reverter estoque ao excluir produção
CREATE OR REPLACE FUNCTION reverter_estoque_producao()
RETURNS TRIGGER AS $$
DECLARE
  v_estoque_producao_id UUID;
  v_reserva RECORD;
  v_saldo RECORD;
BEGIN
  -- Buscar estoque de produção
  SELECT id INTO v_estoque_producao_id
  FROM estoques
  WHERE tipo = 'producao' AND ativo = true
  LIMIT 1;

  -- 1. REVERTER INSUMOS CONSUMIDOS (devolver ao estoque)
  -- Apenas se a produção foi iniciada ou concluída
  IF OLD.status IN ('em_andamento', 'concluido', 'pausado') THEN
    
    -- Para cada insumo reservado e utilizado
    FOR v_reserva IN 
      SELECT * FROM producao_reserva_insumos 
      WHERE producao_id = OLD.id 
      AND status_reserva = 'utilizado'
    LOOP
      -- Devolver quantidade ao estoque
      UPDATE saldos_estoque
      SET quantidade_atual = quantidade_atual + v_reserva.quantidade_utilizada
      WHERE estoque_id = v_reserva.estoque_origem_id
      AND item_id = v_reserva.item_id;

      -- Registrar movimentação de estorno
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

  -- 2. REVERTER ENTRADA DO PRODUTO FINAL (remover do estoque)
  -- Apenas se a produção foi concluída
  IF OLD.status = 'concluido' AND OLD.quantidade_aprovada > 0 THEN
    
    -- Buscar o produto final baseado na ficha técnica
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
        -- Remover quantidade do estoque (usar estoque_destino_id se existir, senão produção)
        UPDATE saldos_estoque
        SET quantidade_atual = GREATEST(0, quantidade_atual - OLD.quantidade_aprovada)
        WHERE estoque_id = COALESCE(OLD.estoque_destino_id, v_estoque_producao_id)
        AND item_id = v_item_produto_id;

        -- Registrar movimentação de estorno
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

  -- 3. REVERTER TRANSFERÊNCIAS (se houver)
  DECLARE
    v_transferencia RECORD;
  BEGIN
    FOR v_transferencia IN 
      SELECT * FROM producao_transferencias 
      WHERE producao_id = OLD.id 
      AND status_transferencia = 'concluida'
    LOOP
      -- Remover do destino
      UPDATE saldos_estoque
      SET quantidade_atual = GREATEST(0, quantidade_atual - v_transferencia.quantidade_transferida)
      WHERE estoque_id = v_transferencia.estoque_destino_id
      AND item_id = v_transferencia.item_id;

      -- Devolver para origem
      UPDATE saldos_estoque
      SET quantidade_atual = quantidade_atual + v_transferencia.quantidade_transferida
      WHERE estoque_id = v_transferencia.estoque_origem_id
      AND item_id = v_transferencia.item_id;

      -- Marcar transferência como revertida
      UPDATE producao_transferencias
      SET status_transferencia = 'cancelada'
      WHERE id = v_transferencia.id;

      -- Registrar movimentações de estorno
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

  -- 4. Registrar no histórico que a produção foi excluída
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

-- 2. Criar trigger para executar reversão antes de excluir
DROP TRIGGER IF EXISTS trigger_reverter_estoque_producao ON producoes;
CREATE TRIGGER trigger_reverter_estoque_producao
  BEFORE DELETE ON producoes
  FOR EACH ROW
  EXECUTE FUNCTION reverter_estoque_producao();

-- 3. Função para preencher automaticamente estoque_destino_id
CREATE OR REPLACE FUNCTION set_estoque_producao_default()
RETURNS TRIGGER AS $$
DECLARE
  v_estoque_producao_id UUID;
BEGIN
  -- Se não foi informado estoque destino, buscar o estoque de produção
  IF NEW.estoque_destino_id IS NULL THEN
    SELECT id INTO v_estoque_producao_id
    FROM estoques
    WHERE tipo = 'producao' AND ativo = true
    LIMIT 1;

    NEW.estoque_destino_id := v_estoque_producao_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_estoque_producao ON producoes;
CREATE TRIGGER trigger_set_estoque_producao
  BEFORE INSERT ON producoes
  FOR EACH ROW
  EXECUTE FUNCTION set_estoque_producao_default();

-- 4. Comentários para documentação
COMMENT ON FUNCTION reverter_estoque_producao() IS 'Reverte automaticamente todas as movimentações de estoque ao excluir uma produção';
COMMENT ON FUNCTION set_estoque_producao_default() IS 'Define automaticamente o estoque de produção como destino quando não informado';
