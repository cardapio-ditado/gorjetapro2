/*
  # Add financial columns to musicos table

  1. New Columns
    - `valor_consumo` (numeric) - Value of consumption (drinks, food, etc.)
    - `valor_adicional` (numeric) - Additional value (extra hours, equipment, etc.)
    - `valor_total_final` (numeric) - Final total value (calculated)
    - `valor_pago` (numeric) - Amount already paid
    - `saldo_restante` (numeric) - Remaining balance

  2. Security
    - All columns are nullable and have default values
    - Constraints ensure non-negative values
*/

-- Add valor_consumo column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_consumo'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_consumo numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add valor_adicional column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_adicional'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_adicional numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add valor_total_final column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_total_final'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_total_final numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add valor_pago column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_pago'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_pago numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add saldo_restante column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'saldo_restante'
  ) THEN
    ALTER TABLE musicos ADD COLUMN saldo_restante numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add constraints to ensure non-negative values
DO $$
BEGIN
  -- Add constraint for valor_consumo
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'musicos_valor_consumo_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_consumo_check CHECK (valor_consumo >= 0);
  END IF;

  -- Add constraint for valor_adicional
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'musicos_valor_adicional_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_adicional_check CHECK (valor_adicional >= 0);
  END IF;

  -- Add constraint for valor_total_final
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'musicos_valor_total_final_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_total_final_check CHECK (valor_total_final >= 0);
  END IF;

  -- Add constraint for valor_pago
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'musicos_valor_pago_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_pago_check CHECK (valor_pago >= 0);
  END IF;

  -- Add constraint for saldo_restante
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'musicos_saldo_restante_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_saldo_restante_check CHECK (saldo_restante >= 0);
  END IF;
END $$;