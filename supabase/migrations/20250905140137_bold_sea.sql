/*
  # Add phone field to eventos_fechados table

  1. Changes
    - Add `telefone_cliente` field to eventos_fechados table
    - Field is optional (nullable)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'eventos_fechados' AND column_name = 'telefone_cliente'
  ) THEN
    ALTER TABLE eventos_fechados ADD COLUMN telefone_cliente text;
  END IF;
END $$;