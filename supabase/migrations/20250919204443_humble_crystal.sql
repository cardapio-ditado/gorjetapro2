/*
  # Fix comissoes_garcom UNIQUE constraint

  1. Problema
    - Upsert falhando com erro 42P10: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
    - Frontend tentando usar onConflict='venda_id' mas constraint não existe

  2. Solução
    - Remover duplicatas existentes
    - Garantir venda_id NOT NULL
    - Criar UNIQUE constraint em venda_id
*/

-- (A) Remover duplicatas mantendo o mais recente por data_calculo
WITH dups AS (
  SELECT ctid,
         ROW_NUMBER() OVER (
           PARTITION BY venda_id 
           ORDER BY COALESCE(data_calculo, NOW()) DESC
         ) AS rn
  FROM public.comissoes_garcom
  WHERE venda_id IS NOT NULL
)
DELETE FROM public.comissoes_garcom c
USING dups
WHERE c.ctid = dups.ctid
  AND dups.rn > 1;

-- (B) Garantir que venda_id seja NOT NULL
ALTER TABLE public.comissoes_garcom
  ALTER COLUMN venda_id SET NOT NULL;

-- (C) Criar UNIQUE constraint em venda_id
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