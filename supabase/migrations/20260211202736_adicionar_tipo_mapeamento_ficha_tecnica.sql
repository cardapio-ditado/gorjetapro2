/*
  # Adicionar campos tipo_mapeamento e ficha_tecnica_id
  
  1. Novas Colunas
    - `tipo_mapeamento`: Tipo de mapeamento (manual ou automatico)
    - `ficha_tecnica_id`: Referência opcional para ficha técnica
    
  2. Motivo
    - Código estava tentando inserir esses campos que não existiam
    - Permite diferenciar mapeamentos manuais de automáticos
    - Permite vincular mapeamento a fichas técnicas para consumo direto
*/

-- Adicionar coluna tipo_mapeamento
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'mapeamento_itens_vendas' AND column_name = 'tipo_mapeamento'
  ) THEN
    ALTER TABLE mapeamento_itens_vendas 
    ADD COLUMN tipo_mapeamento text DEFAULT 'automatico' CHECK (tipo_mapeamento IN ('manual', 'automatico'));
    
    CREATE INDEX IF NOT EXISTS idx_mapeamento_tipo ON mapeamento_itens_vendas(tipo_mapeamento);
  END IF;
END $$;

-- Adicionar coluna ficha_tecnica_id
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'mapeamento_itens_vendas' AND column_name = 'ficha_tecnica_id'
  ) THEN
    ALTER TABLE mapeamento_itens_vendas 
    ADD COLUMN ficha_tecnica_id uuid REFERENCES fichas_tecnicas(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_mapeamento_ficha ON mapeamento_itens_vendas(ficha_tecnica_id);
  END IF;
END $$;
