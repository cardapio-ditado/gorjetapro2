/*
  # Add missing fields to eventos_fechados table

  1. New Columns
    - `quantidade_pessoas` (integer) - Number of people for the event
    - `contrato_assinado` (boolean) - Whether contract is signed
    - `convite_impresso` (boolean) - Whether invitation is printed
    - `data_retirada_convite` (date) - Date when invitation was picked up
    - `data_pagamento_contrato` (date) - Date when contract was paid

  2. Updates
    - Add proper constraints and defaults for new fields
*/

-- Add new columns to eventos_fechados table
DO $$
BEGIN
  -- Add quantidade_pessoas column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eventos_fechados' AND column_name = 'quantidade_pessoas'
  ) THEN
    ALTER TABLE eventos_fechados ADD COLUMN quantidade_pessoas INTEGER DEFAULT 1 CHECK (quantidade_pessoas > 0);
  END IF;

  -- Add contrato_assinado column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eventos_fechados' AND column_name = 'contrato_assinado'
  ) THEN
    ALTER TABLE eventos_fechados ADD COLUMN contrato_assinado BOOLEAN DEFAULT false;
  END IF;

  -- Add convite_impresso column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eventos_fechados' AND column_name = 'convite_impresso'
  ) THEN
    ALTER TABLE eventos_fechados ADD COLUMN convite_impresso BOOLEAN DEFAULT false;
  END IF;

  -- Add data_retirada_convite column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eventos_fechados' AND column_name = 'data_retirada_convite'
  ) THEN
    ALTER TABLE eventos_fechados ADD COLUMN data_retirada_convite DATE;
  END IF;

  -- Add data_pagamento_contrato column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eventos_fechados' AND column_name = 'data_pagamento_contrato'
  ) THEN
    ALTER TABLE eventos_fechados ADD COLUMN data_pagamento_contrato DATE;
  END IF;
END $$;