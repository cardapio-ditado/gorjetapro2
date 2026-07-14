/*
  # Fix Foreign Key Relationship for Ficha Ingredientes

  1. Schema Updates
    - Update ficha_ingredientes table to reference itens_estoque instead of insumos
    - Add proper foreign key constraint
    - Update column name from insumo_id to item_estoque_id

  2. Data Migration
    - Safely migrate existing data if any exists
    - Preserve existing relationships where possible

  3. Security
    - Maintain existing RLS policies
    - Ensure data integrity
*/

-- First, check if we need to rename the column
DO $$
BEGIN
  -- Check if insumo_id column exists and item_estoque_id doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ficha_ingredientes' AND column_name = 'insumo_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ficha_ingredientes' AND column_name = 'item_estoque_id'
  ) THEN
    -- Rename the column to match the correct reference
    ALTER TABLE ficha_ingredientes RENAME COLUMN insumo_id TO item_estoque_id;
  END IF;
END $$;

-- Add item_estoque_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ficha_ingredientes' AND column_name = 'item_estoque_id'
  ) THEN
    ALTER TABLE ficha_ingredientes ADD COLUMN item_estoque_id uuid;
  END IF;
END $$;

-- Drop old foreign key constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ficha_ingredientes_insumo_id_fkey'
  ) THEN
    ALTER TABLE ficha_ingredientes DROP CONSTRAINT ficha_ingredientes_insumo_id_fkey;
  END IF;
END $$;

-- Drop old foreign key constraint with new name if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ficha_ingredientes_item_estoque_id_fkey'
  ) THEN
    ALTER TABLE ficha_ingredientes DROP CONSTRAINT ficha_ingredientes_item_estoque_id_fkey;
  END IF;
END $$;

-- Add the correct foreign key constraint
ALTER TABLE ficha_ingredientes
ADD CONSTRAINT ficha_ingredientes_item_estoque_id_fkey
FOREIGN KEY (item_estoque_id)
REFERENCES itens_estoque(id)
ON DELETE CASCADE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_ficha_ingredientes_item_estoque 
ON ficha_ingredientes(item_estoque_id);

-- Update the view to use the correct relationship
CREATE OR REPLACE VIEW vw_fichas_completas AS
SELECT 
  ft.id as ficha_id,
  ft.nome as nome_ficha,
  ft.categoria,
  ft.dificuldade,
  ft.tempo_preparo,
  ft.porcoes,
  ft.ativo,
  ft.custo_total as custo_estimado,
  ft.criado_em,
  
  -- Aggregate ingredients with correct reference
  COALESCE(
    json_agg(
      json_build_object(
        'item_id', fi.item_estoque_id,
        'item_nome', ie.nome,
        'quantidade', fi.quantidade,
        'unidade_medida', ie.unidade_medida,
        'custo_unitario', ie.custo_medio
      ) ORDER BY ie.nome
    ) FILTER (WHERE fi.id IS NOT NULL),
    '[]'::json
  ) as ingredientes,
  
  -- Calculate total cost from ingredients
  COALESCE(
    SUM(fi.quantidade * COALESCE(ie.custo_medio, 0)),
    0
  ) as custo_total_calculado,
  
  -- Count total productions
  COALESCE(p.total_producoes, 0) as total_producoes

FROM fichas_tecnicas ft
LEFT JOIN ficha_ingredientes fi ON ft.id = fi.ficha_id
LEFT JOIN itens_estoque ie ON fi.item_estoque_id = ie.id
LEFT JOIN (
  SELECT ficha_id, COUNT(*) as total_producoes
  FROM producoes
  GROUP BY ficha_id
) p ON ft.id = p.ficha_id

GROUP BY 
  ft.id, ft.nome, ft.categoria, ft.dificuldade, 
  ft.tempo_preparo, ft.porcoes, ft.ativo, 
  ft.custo_total, ft.criado_em, p.total_producoes;