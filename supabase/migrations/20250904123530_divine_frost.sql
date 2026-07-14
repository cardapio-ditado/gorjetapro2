/*
  # Add missing financial columns to musicos table

  1. New Columns
    - `valor_consumo` (numeric) - Valor do consumo (bebidas, comidas, etc.)
    - `valor_adicional` (numeric) - Valor adicional (horas extras, equipamentos, etc.)
    - `valor_total_final` (numeric) - Valor total final calculado
    - `valor_pago` (numeric) - Valor já pago
    - `saldo_restante` (numeric) - Saldo restante a pagar
    - `status_pagamento` (text) - Status do pagamento (pendente, pago, cancelado)

  2. Security
    - Add check constraints for positive values
    - Update existing records with default values
*/

-- Add missing columns to musicos table
DO $$
BEGIN
  -- Add valor_consumo column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_consumo'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_consumo numeric(10,2) DEFAULT 0;
  END IF;

  -- Add valor_adicional column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_adicional'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_adicional numeric(10,2) DEFAULT 0;
  END IF;

  -- Add valor_total_final column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_total_final'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_total_final numeric(10,2) DEFAULT 0;
  END IF;

  -- Add valor_pago column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_pago'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_pago numeric(10,2) DEFAULT 0;
  END IF;

  -- Add saldo_restante column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'saldo_restante'
  ) THEN
    ALTER TABLE musicos ADD COLUMN saldo_restante numeric(10,2) DEFAULT 0;
  END IF;

  -- Add status_pagamento column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'status_pagamento'
  ) THEN
    ALTER TABLE musicos ADD COLUMN status_pagamento text DEFAULT 'pendente';
  END IF;
END $$;

-- Add check constraints for positive values
DO $$
BEGIN
  -- Add constraint for valor_consumo if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'musicos' AND constraint_name = 'musicos_valor_consumo_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_consumo_check CHECK (valor_consumo >= 0);
  END IF;

  -- Add constraint for valor_adicional if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'musicos' AND constraint_name = 'musicos_valor_adicional_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_adicional_check CHECK (valor_adicional >= 0);
  END IF;

  -- Add constraint for valor_total_final if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'musicos' AND constraint_name = 'musicos_valor_total_final_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_total_final_check CHECK (valor_total_final >= 0);
  END IF;

  -- Add constraint for valor_pago if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'musicos' AND constraint_name = 'musicos_valor_pago_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_pago_check CHECK (valor_pago >= 0);
  END IF;

  -- Add constraint for status_pagamento if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'musicos' AND constraint_name = 'musicos_status_pagamento_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_status_pagamento_check 
    CHECK (status_pagamento IN ('pendente', 'pago', 'cancelado'));
  END IF;
END $$;

-- Update existing records to calculate saldo_restante based on valor_total_final and valor_pago
UPDATE musicos 
SET saldo_restante = COALESCE(valor_total_final, valor, 0) - COALESCE(valor_pago, 0)
WHERE saldo_restante IS NULL OR saldo_restante = 0;

-- Update status_pagamento based on saldo_restante
UPDATE musicos 
SET status_pagamento = CASE 
  WHEN COALESCE(saldo_restante, 0) <= 0 AND COALESCE(valor_pago, 0) > 0 THEN 'pago'
  WHEN COALESCE(saldo_restante, 0) > 0 THEN 'pendente'
  ELSE 'pendente'
END
WHERE status_pagamento IS NULL;