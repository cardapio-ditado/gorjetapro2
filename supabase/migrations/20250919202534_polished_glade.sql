/*
  # Fix comissoes_garcom unique constraint

  1. Problem Resolution
    - Add UNIQUE constraint on venda_id (1 commission per sale)
    - Remove any duplicate records before adding constraint
    - Enable proper upsert operations in frontend

  2. Changes
    - Remove duplicate commission records
    - Add UNIQUE constraint on venda_id
    - Ensure data integrity for commission calculations
*/

-- Remove duplicates if any exist (keep the most recent one)
DELETE FROM public.comissoes_garcom cg
USING public.comissoes_garcom dup
WHERE cg.ctid < dup.ctid
  AND cg.venda_id = dup.venda_id;

-- Add UNIQUE constraint on venda_id (one commission per sale)
ALTER TABLE public.comissoes_garcom
  ADD CONSTRAINT comissoes_garcom_venda_id_key UNIQUE (venda_id);

-- Add missing atualizado_em column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comissoes_garcom' AND column_name = 'atualizado_em'
  ) THEN
    ALTER TABLE public.comissoes_garcom ADD COLUMN atualizado_em timestamptz DEFAULT now();
  END IF;
END $$;