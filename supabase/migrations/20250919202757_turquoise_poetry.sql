/*
  # Fix comissões_garcom UNIQUE constraint

  1. Database Schema Fix
    - Remove duplicate records (keeping most recent)
    - Add NOT NULL constraint on venda_id
    - Add UNIQUE constraint on venda_id (1 commission per sale)
  
  2. Purpose
    - Enable proper upsert operations with onConflict
    - Prevent duplicate commissions for the same sale
    - Fix "no unique constraint matching ON CONFLICT" error
*/

-- (A) Remove duplicatas antes de criar a UNIQUE (mantém o mais recente pelo data_calculo)
WITH dups AS (
  SELECT ctid, 
         row_number() OVER (
           PARTITION BY venda_id 
           ORDER BY COALESCE(data_calculo, criado_em, now()) DESC
         ) AS rn
  FROM public.comissoes_garcom
  WHERE venda_id IS NOT NULL
)
DELETE FROM public.comissoes_garcom c
USING dups
WHERE c.ctid = dups.ctid
  AND dups.rn > 1;

-- (B) Garanta NOT NULL na coluna-chave
ALTER TABLE public.comissoes_garcom
  ALTER COLUMN venda_id SET NOT NULL;

-- (C) Crie a UNIQUE constraint se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = 'comissoes_garcom' 
      AND indexname = 'comissoes_garcom_venda_id_key'
  ) THEN
    ALTER TABLE public.comissoes_garcom
      ADD CONSTRAINT comissoes_garcom_venda_id_key UNIQUE (venda_id);
  END IF;
END$$;