/*
  # Add Default Category to Suppliers

  1. Schema Changes
    - Add categoria_padrao_id to fornecedores table
    - Create foreign key relationship with categorias_financeiras
    - Add index for performance

  2. Benefits
    - Facilitates future accounts payable entries
    - Reduces manual category selection
    - Improves data consistency
*/

-- Add default category field to suppliers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fornecedores' AND column_name = 'categoria_padrao_id'
  ) THEN
    ALTER TABLE fornecedores ADD COLUMN categoria_padrao_id uuid REFERENCES categorias_financeiras(id);
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_fornecedores_categoria_padrao ON fornecedores(categoria_padrao_id);

-- Add trigger function to update timestamp
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for timestamp updates if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'trg_fornecedores_update'
  ) THEN
    CREATE TRIGGER trg_fornecedores_update
      BEFORE UPDATE ON fornecedores
      FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'trg_categorias_financeiras_update'
  ) THEN
    CREATE TRIGGER trg_categorias_financeiras_update
      BEFORE UPDATE ON categorias_financeiras
      FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'trg_centros_custo_update'
  ) THEN
    CREATE TRIGGER trg_centros_custo_update
      BEFORE UPDATE ON centros_custo
      FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'trg_formas_pagamento_update'
  ) THEN
    CREATE TRIGGER trg_formas_pagamento_update
      BEFORE UPDATE ON formas_pagamento
      FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'trg_contas_bancarias_update'
  ) THEN
    CREATE TRIGGER trg_contas_bancarias_update
      BEFORE UPDATE ON contas_bancarias
      FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
  END IF;
END $$;