/*
  # Adicionar controle de quantidade recebida nas compras

  ## Descrição
  Adiciona campos para registrar a quantidade efetivamente recebida vs. a quantidade pedida,
  permitindo identificar divergências no recebimento de mercadorias.

  ## Mudanças
  
  1. Adicionar campos à tabela `itens_entrada_compra`:
     - `quantidade_pedida` - Quantidade original do pedido
     - `quantidade_recebida` - Quantidade efetivamente recebida
     - `divergencia` - Flag indicando se há divergência
     - `motivo_divergencia` - Descrição do motivo da divergência
     - `data_recebimento` - Data do recebimento físico
     - `recebido_por` - Usuário que conferiu o recebimento

  2. Migrar dados existentes:
     - Copiar `quantidade` para `quantidade_pedida`
     - Para compras já recebidas, copiar também para `quantidade_recebida`
     
  ## Notas Importantes
  - A quantidade original permanece em `quantidade_pedida`
  - `quantidade_recebida` é preenchida no momento da conferência
  - `divergencia` é calculada automaticamente quando há diferença
*/

-- Adicionar novos campos à tabela itens_entrada_compra
DO $$
BEGIN
  -- Adicionar quantidade_pedida (será a quantidade original)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_entrada_compra' AND column_name = 'quantidade_pedida'
  ) THEN
    ALTER TABLE itens_entrada_compra ADD COLUMN quantidade_pedida numeric;
  END IF;

  -- Adicionar quantidade_recebida
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_entrada_compra' AND column_name = 'quantidade_recebida'
  ) THEN
    ALTER TABLE itens_entrada_compra ADD COLUMN quantidade_recebida numeric;
  END IF;

  -- Adicionar flag de divergência
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_entrada_compra' AND column_name = 'divergencia'
  ) THEN
    ALTER TABLE itens_entrada_compra ADD COLUMN divergencia boolean DEFAULT false;
  END IF;

  -- Adicionar motivo da divergência
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_entrada_compra' AND column_name = 'motivo_divergencia'
  ) THEN
    ALTER TABLE itens_entrada_compra ADD COLUMN motivo_divergencia text;
  END IF;

  -- Adicionar data de recebimento
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_entrada_compra' AND column_name = 'data_recebimento'
  ) THEN
    ALTER TABLE itens_entrada_compra ADD COLUMN data_recebimento timestamptz;
  END IF;

  -- Adicionar recebido por
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'itens_entrada_compra' AND column_name = 'recebido_por'
  ) THEN
    ALTER TABLE itens_entrada_compra ADD COLUMN recebido_por uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Migrar dados existentes
-- Copiar quantidade atual para quantidade_pedida
UPDATE itens_entrada_compra
SET quantidade_pedida = quantidade
WHERE quantidade_pedida IS NULL;

-- Para compras já recebidas, copiar quantidade para quantidade_recebida também
UPDATE itens_entrada_compra iec
SET quantidade_recebida = iec.quantidade
FROM entradas_compras ec
WHERE iec.entrada_compra_id = ec.id 
  AND ec.status = 'recebido'
  AND iec.quantidade_recebida IS NULL;

-- Adicionar constraints
DO $$
BEGIN
  -- Quantidade pedida deve ser positiva
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'itens_entrada_quantidade_pedida_check'
  ) THEN
    ALTER TABLE itens_entrada_compra 
    ADD CONSTRAINT itens_entrada_quantidade_pedida_check 
    CHECK (quantidade_pedida > 0);
  END IF;

  -- Quantidade recebida deve ser não-negativa (0 = nada recebido)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE constraint_name = 'itens_entrada_quantidade_recebida_check'
  ) THEN
    ALTER TABLE itens_entrada_compra 
    ADD CONSTRAINT itens_entrada_quantidade_recebida_check 
    CHECK (quantidade_recebida >= 0);
  END IF;
END $$;

-- Criar função para calcular divergência automaticamente
CREATE OR REPLACE FUNCTION calcular_divergencia_item_compra()
RETURNS TRIGGER AS $$
BEGIN
  -- Se quantidade_recebida foi definida, calcular divergência
  IF NEW.quantidade_recebida IS NOT NULL AND NEW.quantidade_pedida IS NOT NULL THEN
    NEW.divergencia := (NEW.quantidade_recebida != NEW.quantidade_pedida);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para calcular divergência automaticamente
DROP TRIGGER IF EXISTS trigger_calcular_divergencia_item ON itens_entrada_compra;
CREATE TRIGGER trigger_calcular_divergencia_item
  BEFORE INSERT OR UPDATE ON itens_entrada_compra
  FOR EACH ROW
  EXECUTE FUNCTION calcular_divergencia_item_compra();