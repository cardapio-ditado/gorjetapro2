/*
  # Add financial fields to musicos table

  1. New Columns
    - `valor_consumo` (numeric) - Valor do consumo do músico
    - `valor_adicional` (numeric) - Valor adicional por horas extras, equipamentos, etc.
    - `valor_total_final` (numeric) - Valor total final (cachê + consumo + adicional)
    - `valor_pago` (numeric) - Valor já pago
    - `saldo_restante` (numeric) - Saldo restante a pagar

  2. Security
    - Maintain existing RLS policies
    - Add check constraints for positive values
*/

-- Add financial columns to musicos table
DO $$
BEGIN
  -- Add valor_consumo column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_consumo'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_consumo numeric(10,2) DEFAULT 0;
  END IF;

  -- Add valor_adicional column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_adicional'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_adicional numeric(10,2) DEFAULT 0;
  END IF;

  -- Add valor_total_final column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_total_final'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_total_final numeric(10,2) DEFAULT 0;
  END IF;

  -- Add valor_pago column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'valor_pago'
  ) THEN
    ALTER TABLE musicos ADD COLUMN valor_pago numeric(10,2) DEFAULT 0;
  END IF;

  -- Add saldo_restante column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'musicos' AND column_name = 'saldo_restante'
  ) THEN
    ALTER TABLE musicos ADD COLUMN saldo_restante numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Add check constraints for positive values
DO $$
BEGIN
  -- Check if constraint doesn't exist before adding
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'musicos_valor_consumo_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_consumo_check CHECK (valor_consumo >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'musicos_valor_adicional_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_adicional_check CHECK (valor_adicional >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'musicos_valor_total_final_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_total_final_check CHECK (valor_total_final >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'musicos_valor_pago_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_valor_pago_check CHECK (valor_pago >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'musicos_saldo_restante_check'
  ) THEN
    ALTER TABLE musicos ADD CONSTRAINT musicos_saldo_restante_check CHECK (saldo_restante >= 0);
  END IF;
END $$;