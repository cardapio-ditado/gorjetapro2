/*
  # Fix ficha_ingredientes table structure

  1. Table Updates
    - Ensure ficha_ingredientes table has correct structure
    - Fix foreign key references to point to correct tables
    - Add proper constraints and indexes

  2. Foreign Key Corrections
    - ficha_id references fichas_tecnicas(id)
    - item_estoque_id references itens_estoque(id) (not insumos)

  3. Security
    - Enable RLS on ficha_ingredientes table
    - Add policies for authenticated users

  4. Performance
    - Add indexes for better query performance
*/

-- Drop existing foreign key constraints if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ficha_ingredientes_insumo_id_fkey'
  ) THEN
    ALTER TABLE ficha_ingredientes DROP CONSTRAINT ficha_ingredientes_insumo_id_fkey;
  END IF;
END $$;

-- Ensure the table has the correct structure
DO $$
BEGIN
  -- Check if item_estoque_id column exists, if not rename insumo_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ficha_ingredientes' AND column_name = 'insumo_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ficha_ingredientes' AND column_name = 'item_estoque_id'
  ) THEN
    ALTER TABLE ficha_ingredientes RENAME COLUMN insumo_id TO item_estoque_id;
  END IF;
END $$;

-- Ensure all required columns exist
DO $$
BEGIN
  -- Add item_estoque_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ficha_ingredientes' AND column_name = 'item_estoque_id'
  ) THEN
    ALTER TABLE ficha_ingredientes ADD COLUMN item_estoque_id UUID;
  END IF;

  -- Add quantidade if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ficha_ingredientes' AND column_name = 'quantidade'
  ) THEN
    ALTER TABLE ficha_ingredientes ADD COLUMN quantidade NUMERIC(10,3) DEFAULT 0;
  END IF;

  -- Add ficha_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ficha_ingredientes' AND column_name = 'ficha_id'
  ) THEN
    ALTER TABLE ficha_ingredientes ADD COLUMN ficha_id UUID;
  END IF;
END $$;

-- Add proper constraints
DO $$
BEGIN
  -- Add NOT NULL constraints if they don't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ficha_ingredientes' 
    AND column_name = 'ficha_id' 
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE ficha_ingredientes ALTER COLUMN ficha_id SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ficha_ingredientes' 
    AND column_name = 'item_estoque_id' 
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE ficha_ingredientes ALTER COLUMN item_estoque_id SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ficha_ingredientes' 
    AND column_name = 'quantidade' 
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE ficha_ingredientes ALTER COLUMN quantidade SET NOT NULL;
  END IF;
END $$;

-- Add check constraint for quantidade
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'ficha_ingredientes_quantidade_check'
  ) THEN
    ALTER TABLE ficha_ingredientes ADD CONSTRAINT ficha_ingredientes_quantidade_check CHECK (quantidade > 0);
  END IF;
END $$;

-- Add foreign key constraints
DO $$
BEGIN
  -- Foreign key to fichas_tecnicas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ficha_ingredientes_ficha_id_fkey'
  ) THEN
    ALTER TABLE ficha_ingredientes 
    ADD CONSTRAINT ficha_ingredientes_ficha_id_fkey 
    FOREIGN KEY (ficha_id) REFERENCES fichas_tecnicas(id) ON DELETE CASCADE;
  END IF;

  -- Foreign key to itens_estoque
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ficha_ingredientes_item_estoque_id_fkey'
  ) THEN
    ALTER TABLE ficha_ingredientes 
    ADD CONSTRAINT ficha_ingredientes_item_estoque_id_fkey 
    FOREIGN KEY (item_estoque_id) REFERENCES itens_estoque(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for better performance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_ficha_ingredientes_ficha_id'
  ) THEN
    CREATE INDEX idx_ficha_ingredientes_ficha_id ON ficha_ingredientes(ficha_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_ficha_ingredientes_item_estoque_id'
  ) THEN
    CREATE INDEX idx_ficha_ingredientes_item_estoque_id ON ficha_ingredientes(item_estoque_id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE ficha_ingredientes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ficha_ingredientes' AND policyname = 'Allow all operations on ficha_ingredientes'
  ) THEN
    CREATE POLICY "Allow all operations on ficha_ingredientes"
      ON ficha_ingredientes
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Update the view to use correct column names
DROP VIEW IF EXISTS vw_fichas_completas;

CREATE VIEW vw_fichas_completas AS
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
  
  -- Ingredientes como JSON
  COALESCE(
    json_agg(
      json_build_object(
        'id', fi.id,
        'item_id', fi.item_estoque_id,
        'item_nome', ie.nome,
        'item_codigo', ie.codigo,
        'unidade_medida', ie.unidade_medida,
        'quantidade', fi.quantidade,
        'custo_unitario', ie.custo_medio,
        'custo_total', fi.quantidade * COALESCE(ie.custo_medio, 0)
      ) ORDER BY ie.nome
    ) FILTER (WHERE fi.id IS NOT NULL),
    '[]'::json
  ) as ingredientes,
  
  -- Custo total calculado
  COALESCE(
    SUM(fi.quantidade * COALESCE(ie.custo_medio, 0)),
    0
  ) as custo_total_calculado,
  
  -- Total de produções
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
  ft.custo_total, ft.criado_em, p.total_producoes

ORDER BY ft.criado_em DESC;