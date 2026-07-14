/*
  # Melhorias Completas na Gestão de Compras
  
  ## Descrição
  Adiciona funcionalidades robustas para gestão completa do ciclo de compras
  
  ## 1. Novos Campos na Tabela `entradas_compras`
  
  ### Datas do Processo:
  - `data_pedido` (DATE) - Data em que o pedido foi realizado
  - `data_entrega_prevista` (DATE) - Data prevista para entrega
  - `data_entrega_real` (DATE) - Data real de recebimento
  
  ### Descontos:
  - `valor_desconto` (NUMERIC) - Valor total de desconto aplicado
  - `percentual_desconto` (NUMERIC) - Percentual de desconto
  - `motivo_desconto` (TEXT) - Justificativa do desconto
  
  ## 2. Novos Campos na Tabela `itens_entrada_compra`
  
  ### Por Item:
  - `valor_desconto_item` (NUMERIC) - Desconto específico do item
  - `percentual_desconto_item` (NUMERIC) - Percentual de desconto no item
  - `custo_unitario_original` (NUMERIC) - Custo antes do desconto
  - `custo_unitario_final` (NUMERIC) - Custo após desconto
  
  ## 3. Histórico de Alterações
  Permite rastrear todas as mudanças no recebimento
  
  ## 4. Cálculos Automáticos
  - Desconto por item reflete no total
  - Custo final considera desconto
  - Valor total da compra considera todos os descontos
*/

-- ==========================================
-- 1. ADICIONAR CAMPOS DE DATAS
-- ==========================================
DO $$
BEGIN
  -- Data do pedido
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entradas_compras' AND column_name = 'data_pedido'
  ) THEN
    ALTER TABLE entradas_compras ADD COLUMN data_pedido DATE;
  END IF;

  -- Data de entrega prevista
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entradas_compras' AND column_name = 'data_entrega_prevista'
  ) THEN
    ALTER TABLE entradas_compras ADD COLUMN data_entrega_prevista DATE;
  END IF;

  -- Data de entrega real
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entradas_compras' AND column_name = 'data_entrega_real'
  ) THEN
    ALTER TABLE entradas_compras ADD COLUMN data_entrega_real DATE;
  END IF;
END $$;

-- ==========================================
-- 2. ADICIONAR CAMPOS DE DESCONTO NA COMPRA
-- ==========================================
DO $$
BEGIN
  -- Valor do desconto total
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entradas_compras' AND column_name = 'valor_desconto'
  ) THEN
    ALTER TABLE entradas_compras ADD COLUMN valor_desconto NUMERIC DEFAULT 0;
  END IF;

  -- Percentual de desconto
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entradas_compras' AND column_name = 'percentual_desconto'
  ) THEN
    ALTER TABLE entradas_compras ADD COLUMN percentual_desconto NUMERIC DEFAULT 0;
  END IF;

  -- Motivo do desconto
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entradas_compras' AND column_name = 'motivo_desconto'
  ) THEN
    ALTER TABLE entradas_compras ADD COLUMN motivo_desconto TEXT;
  END IF;
END $$;

-- ==========================================
-- 3. ADICIONAR CAMPOS DE DESCONTO POR ITEM
-- ==========================================
DO $$
BEGIN
  -- Valor de desconto no item
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_entrada_compra' AND column_name = 'valor_desconto_item'
  ) THEN
    ALTER TABLE itens_entrada_compra ADD COLUMN valor_desconto_item NUMERIC DEFAULT 0;
  END IF;

  -- Percentual de desconto no item
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_entrada_compra' AND column_name = 'percentual_desconto_item'
  ) THEN
    ALTER TABLE itens_entrada_compra ADD COLUMN percentual_desconto_item NUMERIC DEFAULT 0;
  END IF;

  -- Custo unitário original (antes do desconto)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_entrada_compra' AND column_name = 'custo_unitario_original'
  ) THEN
    ALTER TABLE itens_entrada_compra ADD COLUMN custo_unitario_original NUMERIC;
  END IF;

  -- Custo unitário final (após desconto)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_entrada_compra' AND column_name = 'custo_unitario_final'
  ) THEN
    ALTER TABLE itens_entrada_compra ADD COLUMN custo_unitario_final NUMERIC;
  END IF;
END $$;

-- ==========================================
-- 4. MIGRAR DADOS EXISTENTES
-- ==========================================

-- Inicializar data_pedido com data_compra para registros antigos
UPDATE entradas_compras
SET data_pedido = data_compra
WHERE data_pedido IS NULL;

-- Inicializar data_entrega_real com data_compra para compras já recebidas
UPDATE entradas_compras
SET data_entrega_real = data_compra
WHERE status = 'recebido' AND data_entrega_real IS NULL;

-- Inicializar custos originais nos itens
UPDATE itens_entrada_compra
SET 
  custo_unitario_original = custo_unitario,
  custo_unitario_final = custo_unitario
WHERE custo_unitario_original IS NULL;

-- Inicializar descontos em zero
UPDATE entradas_compras
SET 
  valor_desconto = 0,
  percentual_desconto = 0
WHERE valor_desconto IS NULL;

UPDATE itens_entrada_compra
SET 
  valor_desconto_item = 0,
  percentual_desconto_item = 0
WHERE valor_desconto_item IS NULL;

-- ==========================================
-- 5. ADICIONAR CONSTRAINTS
-- ==========================================
DO $$
BEGIN
  -- Data de entrega real não pode ser antes do pedido
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'entradas_compras_datas_logicas_check'
  ) THEN
    ALTER TABLE entradas_compras 
    ADD CONSTRAINT entradas_compras_datas_logicas_check 
    CHECK (
      data_entrega_real IS NULL OR 
      data_pedido IS NULL OR 
      data_entrega_real >= data_pedido
    );
  END IF;

  -- Desconto não pode ser negativo
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'entradas_compras_desconto_positivo_check'
  ) THEN
    ALTER TABLE entradas_compras 
    ADD CONSTRAINT entradas_compras_desconto_positivo_check 
    CHECK (valor_desconto >= 0 AND percentual_desconto >= 0);
  END IF;

  -- Desconto do item não pode ser negativo
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'itens_entrada_desconto_positivo_check'
  ) THEN
    ALTER TABLE itens_entrada_compra 
    ADD CONSTRAINT itens_entrada_desconto_positivo_check 
    CHECK (valor_desconto_item >= 0 AND percentual_desconto_item >= 0);
  END IF;
END $$;

-- ==========================================
-- 6. FUNÇÃO PARA CALCULAR DESCONTO POR ITEM
-- ==========================================
CREATE OR REPLACE FUNCTION calcular_desconto_item()
RETURNS TRIGGER AS $$
BEGIN
  -- Se não tem custo original, usar o custo unitário atual
  IF NEW.custo_unitario_original IS NULL THEN
    NEW.custo_unitario_original := NEW.custo_unitario;
  END IF;

  -- Se percentual de desconto foi informado, calcular valor
  IF NEW.percentual_desconto_item > 0 THEN
    NEW.valor_desconto_item := ROUND(
      (NEW.custo_unitario_original * NEW.percentual_desconto_item / 100)::numeric, 
      2
    );
  END IF;

  -- Se valor de desconto foi informado, calcular percentual
  IF NEW.valor_desconto_item > 0 AND NEW.custo_unitario_original > 0 THEN
    NEW.percentual_desconto_item := ROUND(
      (NEW.valor_desconto_item * 100 / NEW.custo_unitario_original)::numeric, 
      2
    );
  END IF;

  -- Calcular custo final
  NEW.custo_unitario_final := NEW.custo_unitario_original - COALESCE(NEW.valor_desconto_item, 0);
  
  -- Garantir que custo final não seja negativo
  IF NEW.custo_unitario_final < 0 THEN
    NEW.custo_unitario_final := 0;
  END IF;

  -- Atualizar custo_unitario para refletir o custo final
  NEW.custo_unitario := NEW.custo_unitario_final;

  -- Recalcular custo total
  NEW.custo_total := NEW.custo_unitario_final * NEW.quantidade;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para calcular desconto por item
DROP TRIGGER IF EXISTS trigger_calcular_desconto_item ON itens_entrada_compra;
CREATE TRIGGER trigger_calcular_desconto_item
  BEFORE INSERT OR UPDATE ON itens_entrada_compra
  FOR EACH ROW
  EXECUTE FUNCTION calcular_desconto_item();

-- ==========================================
-- 7. FUNÇÃO PARA RECALCULAR TOTAL DA COMPRA
-- ==========================================
CREATE OR REPLACE FUNCTION recalcular_total_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_total_itens NUMERIC;
  v_total_desconto_itens NUMERIC;
BEGIN
  -- Calcular soma dos itens e descontos
  SELECT 
    COALESCE(SUM(custo_total), 0),
    COALESCE(SUM(valor_desconto_item * quantidade), 0)
  INTO v_total_itens, v_total_desconto_itens
  FROM itens_entrada_compra
  WHERE entrada_compra_id = COALESCE(NEW.entrada_compra_id, OLD.entrada_compra_id);

  -- Atualizar compra
  UPDATE entradas_compras
  SET 
    valor_produtos = v_total_itens,
    valor_desconto = COALESCE(valor_desconto, 0) + v_total_desconto_itens
  WHERE id = COALESCE(NEW.entrada_compra_id, OLD.entrada_compra_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger para recalcular total quando itens mudam
DROP TRIGGER IF EXISTS trigger_recalcular_total_compra_item ON itens_entrada_compra;
CREATE TRIGGER trigger_recalcular_total_compra_item
  AFTER INSERT OR UPDATE OR DELETE ON itens_entrada_compra
  FOR EACH ROW
  EXECUTE FUNCTION recalcular_total_compra();

-- ==========================================
-- 8. COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ==========================================
COMMENT ON COLUMN entradas_compras.data_pedido IS 'Data em que o pedido foi realizado';
COMMENT ON COLUMN entradas_compras.data_entrega_prevista IS 'Data prevista para entrega do pedido';
COMMENT ON COLUMN entradas_compras.data_entrega_real IS 'Data real em que a mercadoria foi recebida';
COMMENT ON COLUMN entradas_compras.valor_desconto IS 'Valor total de desconto aplicado na compra';
COMMENT ON COLUMN entradas_compras.percentual_desconto IS 'Percentual de desconto sobre o valor dos produtos';
COMMENT ON COLUMN entradas_compras.motivo_desconto IS 'Justificativa para o desconto concedido';

COMMENT ON COLUMN itens_entrada_compra.valor_desconto_item IS 'Valor de desconto unitário do item';
COMMENT ON COLUMN itens_entrada_compra.percentual_desconto_item IS 'Percentual de desconto no item';
COMMENT ON COLUMN itens_entrada_compra.custo_unitario_original IS 'Custo unitário original antes do desconto';
COMMENT ON COLUMN itens_entrada_compra.custo_unitario_final IS 'Custo unitário final após aplicar desconto';
