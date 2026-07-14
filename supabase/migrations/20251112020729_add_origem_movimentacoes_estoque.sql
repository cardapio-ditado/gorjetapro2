/*
  # Adicionar rastreamento de origem nas movimentações

  1. Novas Colunas
    - `origem_tipo` - tipo da origem (compra, producao, ajuste, etc)
    - `origem_id` - ID do registro de origem
    - `item_descricao` - descrição textual do item (backup)

  2. Índices
    - Por origem para consultas rápidas
*/

-- Adicionar colunas se não existirem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'movimentacoes_estoque' AND column_name = 'origem_tipo'
  ) THEN
    ALTER TABLE movimentacoes_estoque ADD COLUMN origem_tipo text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'movimentacoes_estoque' AND column_name = 'origem_id'
  ) THEN
    ALTER TABLE movimentacoes_estoque ADD COLUMN origem_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'movimentacoes_estoque' AND column_name = 'item_descricao'
  ) THEN
    ALTER TABLE movimentacoes_estoque ADD COLUMN item_descricao text;
  END IF;
END $$;

-- Criar índice para origem
CREATE INDEX IF NOT EXISTS idx_mov_estoque_origem_tipo ON movimentacoes_estoque (origem_tipo, origem_id);