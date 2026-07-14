/*
  # Adicionar Encargos nas Compras

  ## Descrição
  Adiciona campos para registrar encargos adicionais nas compras, como:
  - Encargos financeiros por prazo de pagamento
  - Taxas de entrega
  - Outros custos adicionais do fornecedor

  ## 1. Mudanças na tabela `entradas_compras`
  
  ### Novos campos:
  - `valor_produtos` (NUMERIC) - Valor dos produtos sem encargos
  - `valor_encargos` (NUMERIC) - Valor total dos encargos
  - `percentual_encargos` (NUMERIC) - Percentual de encargos sobre o valor dos produtos
  - `descricao_encargos` (TEXT) - Descrição dos encargos (ex: "Taxa de entrega + 2% financeiro")
  - `valor_total` continua sendo o valor final (produtos + encargos)

  ## 2. Comportamento
  
  ### Cálculo automático:
  - Se `percentual_encargos` for informado, calcula `valor_encargos` automaticamente
  - Se `valor_encargos` for informado, calcula `percentual_encargos` automaticamente
  - `valor_total` = `valor_produtos` + `valor_encargos`

  ### Compatibilidade:
  - Compras antigas sem encargos: `valor_produtos` = `valor_total`, `valor_encargos` = 0
  - Compras novas: usuário informa produtos e encargos separadamente

  ## 3. Exemplos de uso

  ### Exemplo 1: Fornecedor cobra 2% de encargo financeiro
  - Produtos: R$ 1.000,00
  - Percentual encargos: 2%
  - Valor encargos: R$ 20,00 (calculado automaticamente)
  - Valor total: R$ 1.020,00

  ### Exemplo 2: Taxa de entrega fixa
  - Produtos: R$ 500,00
  - Valor encargos: R$ 50,00 (entrega)
  - Percentual: 10% (calculado automaticamente)
  - Valor total: R$ 550,00

  ## 4. Segurança
  - Mantém RLS existente
  - Triggers para cálculo automático
  - Validações de valores positivos
*/

-- Adicionar novos campos à tabela entradas_compras
DO $$
BEGIN
  -- Adicionar valor_produtos (valor dos produtos sem encargos)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entradas_compras' AND column_name = 'valor_produtos'
  ) THEN
    ALTER TABLE entradas_compras ADD COLUMN valor_produtos NUMERIC;
  END IF;

  -- Adicionar valor_encargos
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entradas_compras' AND column_name = 'valor_encargos'
  ) THEN
    ALTER TABLE entradas_compras ADD COLUMN valor_encargos NUMERIC DEFAULT 0;
  END IF;

  -- Adicionar percentual_encargos
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entradas_compras' AND column_name = 'percentual_encargos'
  ) THEN
    ALTER TABLE entradas_compras ADD COLUMN percentual_encargos NUMERIC DEFAULT 0;
  END IF;

  -- Adicionar descricao_encargos
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entradas_compras' AND column_name = 'descricao_encargos'
  ) THEN
    ALTER TABLE entradas_compras ADD COLUMN descricao_encargos TEXT;
  END IF;
END $$;

-- Migrar dados existentes
-- Para compras antigas, valor_produtos = valor_total (sem encargos)
UPDATE entradas_compras
SET 
  valor_produtos = valor_total,
  valor_encargos = 0,
  percentual_encargos = 0
WHERE valor_produtos IS NULL;

-- Adicionar constraints
DO $$
BEGIN
  -- Valor dos produtos deve ser não-negativo
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'entradas_compras_valor_produtos_check'
  ) THEN
    ALTER TABLE entradas_compras 
    ADD CONSTRAINT entradas_compras_valor_produtos_check 
    CHECK (valor_produtos >= 0);
  END IF;

  -- Valor de encargos deve ser não-negativo
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'entradas_compras_valor_encargos_check'
  ) THEN
    ALTER TABLE entradas_compras 
    ADD CONSTRAINT entradas_compras_valor_encargos_check 
    CHECK (valor_encargos >= 0);
  END IF;

  -- Percentual de encargos deve ser não-negativo
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'entradas_compras_percentual_encargos_check'
  ) THEN
    ALTER TABLE entradas_compras 
    ADD CONSTRAINT entradas_compras_percentual_encargos_check 
    CHECK (percentual_encargos >= 0);
  END IF;
END $$;

-- Criar função para calcular encargos e valor total automaticamente
CREATE OR REPLACE FUNCTION calcular_encargos_compra()
RETURNS TRIGGER AS $$
BEGIN
  -- Se valor_produtos não está definido, usar valor_total (compatibilidade)
  IF NEW.valor_produtos IS NULL THEN
    NEW.valor_produtos := NEW.valor_total;
    NEW.valor_encargos := 0;
    NEW.percentual_encargos := 0;
  ELSE
    -- Se percentual_encargos foi informado, calcular valor_encargos
    IF NEW.percentual_encargos > 0 AND (OLD.percentual_encargos IS NULL OR NEW.percentual_encargos != OLD.percentual_encargos) THEN
      NEW.valor_encargos := ROUND((NEW.valor_produtos * NEW.percentual_encargos / 100)::numeric, 2);
    END IF;

    -- Se valor_encargos foi informado, calcular percentual_encargos
    IF NEW.valor_encargos > 0 AND NEW.valor_produtos > 0 AND (OLD.valor_encargos IS NULL OR NEW.valor_encargos != OLD.valor_encargos) THEN
      NEW.percentual_encargos := ROUND((NEW.valor_encargos * 100 / NEW.valor_produtos)::numeric, 2);
    END IF;

    -- Se nenhum encargo foi informado, zerar
    IF NEW.valor_encargos IS NULL THEN
      NEW.valor_encargos := 0;
    END IF;
    IF NEW.percentual_encargos IS NULL THEN
      NEW.percentual_encargos := 0;
    END IF;

    -- Calcular valor_total (produtos + encargos)
    NEW.valor_total := NEW.valor_produtos + COALESCE(NEW.valor_encargos, 0);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para calcular encargos automaticamente
DROP TRIGGER IF EXISTS trigger_calcular_encargos_compra ON entradas_compras;
CREATE TRIGGER trigger_calcular_encargos_compra
  BEFORE INSERT OR UPDATE ON entradas_compras
  FOR EACH ROW
  EXECUTE FUNCTION calcular_encargos_compra();

-- Comentários para documentação
COMMENT ON COLUMN entradas_compras.valor_produtos IS 'Valor dos produtos sem encargos adicionais';
COMMENT ON COLUMN entradas_compras.valor_encargos IS 'Valor total dos encargos (entrega, financeiro, etc)';
COMMENT ON COLUMN entradas_compras.percentual_encargos IS 'Percentual de encargos sobre o valor dos produtos';
COMMENT ON COLUMN entradas_compras.descricao_encargos IS 'Descrição dos encargos aplicados (ex: Taxa de entrega + 2% financeiro)';
COMMENT ON COLUMN entradas_compras.valor_total IS 'Valor total da compra (produtos + encargos)';
