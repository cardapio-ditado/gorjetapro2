/*
  # Allow null values in contas_pagar.descricao

  1. Changes
    - Remove NOT NULL constraint from descricao column in contas_pagar table
    - This allows the automatic synchronization with musicos table to work properly

  2. Security
    - No changes to RLS policies needed
*/

DO $$
BEGIN
  -- Remove NOT NULL constraint from descricao column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contas_pagar' 
    AND column_name = 'descricao' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE contas_pagar ALTER COLUMN descricao DROP NOT NULL;
  END IF;
END $$;