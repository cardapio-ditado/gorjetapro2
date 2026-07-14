/*
  # Corrigir trigger de compras para usar idempotency_key

  ## Problema
  A função processar_entrada_compra() usa DELETE + INSERT para "idempotência".
  Isso é perigoso: se chamada múltiplas vezes, apaga movimentações legítimas.

  ## Solução
  - Usar idempotency_key = 'compra_{compra_id}_{item_id}' 
  - Verificar antes de inserir (nunca deletar)
  - Mesma lógica safe usada nas requisições

  ## Notas
  - Movimentações antigas sem idempotency_key são preservadas
  - Apenas novas confirmações usam a chave
*/

CREATE OR REPLACE FUNCTION processar_entrada_compra()
RETURNS TRIGGER AS $$
DECLARE
  item_entrada       RECORD;
  chave_idempotency  TEXT;
  ja_existe          BOOLEAN;
  novo_custo_medio   NUMERIC;
  quantidade_efetiva NUMERIC;
BEGIN
  -- Processar apenas quando status muda para 'recebido'
  IF NEW.status != 'recebido' OR (OLD.status IS NOT NULL AND OLD.status = 'recebido') THEN
    RETURN NEW;
  END IF;

  FOR item_entrada IN
    SELECT
      item_id,
      COALESCE(quantidade_recebida, quantidade) AS quantidade,
      quantidade_pedida,
      quantidade_recebida,
      custo_unitario
    FROM itens_entrada_compra
    WHERE entrada_compra_id = NEW.id
  LOOP
    quantidade_efetiva := item_entrada.quantidade;

    IF COALESCE(quantidade_efetiva, 0) <= 0 THEN
      CONTINUE;
    END IF;

    -- Idempotência: uma movimentação por item/compra
    chave_idempotency := 'compra_' || NEW.id::TEXT || '_' || item_entrada.item_id::TEXT;

    SELECT EXISTS(
      SELECT 1 FROM movimentacoes_estoque
      WHERE idempotency_key = chave_idempotency
    ) INTO ja_existe;

    IF ja_existe THEN
      CONTINUE;
    END IF;

    -- Calcular custo médio
    SELECT
      CASE
        WHEN se.quantidade_atual > 0
        THEN (se.quantidade_atual * COALESCE(ie.custo_medio, 0) + quantidade_efetiva * item_entrada.custo_unitario)
             / (se.quantidade_atual + quantidade_efetiva)
        ELSE item_entrada.custo_unitario
      END
    INTO novo_custo_medio
    FROM itens_estoque ie
    LEFT JOIN saldos_estoque se
      ON se.item_id = ie.id AND se.estoque_id = NEW.estoque_destino_id
    WHERE ie.id = item_entrada.item_id;

    -- Atualizar custo médio no cadastro do item
    UPDATE itens_estoque
    SET custo_medio   = COALESCE(novo_custo_medio, item_entrada.custo_unitario),
        atualizado_em = NOW()
    WHERE id = item_entrada.item_id;

    -- Inserir movimentação idempotente
    INSERT INTO movimentacoes_estoque (
      estoque_origem_id, estoque_destino_id,
      item_id, tipo_movimentacao, quantidade,
      custo_unitario, custo_total,
      data_movimentacao, motivo, observacoes,
      origem_tipo, origem_id,
      criado_por, criado_em,
      idempotency_key
    ) VALUES (
      NULL,
      NEW.estoque_destino_id,
      item_entrada.item_id,
      'entrada',
      quantidade_efetiva,
      item_entrada.custo_unitario,
      quantidade_efetiva * item_entrada.custo_unitario,
      NEW.data_compra,
      'Entrada por compra',
      CONCAT(
        'Compra: ', COALESCE(NEW.numero_documento, ''),
        CASE
          WHEN item_entrada.quantidade_recebida IS NOT NULL
               AND item_entrada.quantidade_recebida != item_entrada.quantidade_pedida
          THEN CONCAT(' | Pedido: ', item_entrada.quantidade_pedida,
                      ' Recebido: ', item_entrada.quantidade_recebida)
          ELSE ''
        END
      ),
      'compra',
      NEW.id,
      NEW.criado_por,
      NOW(),
      chave_idempotency
    );

  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantir que o trigger está ativo
DROP TRIGGER IF EXISTS trg_processar_entrada_compra ON entradas_compras;
CREATE TRIGGER trg_processar_entrada_compra
  AFTER UPDATE ON entradas_compras
  FOR EACH ROW
  EXECUTE FUNCTION processar_entrada_compra();

GRANT EXECUTE ON FUNCTION processar_entrada_compra() TO anon, authenticated;
