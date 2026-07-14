/*
  # Adicionar coluna fornecedor à tabela itens_estoque

  1. Alterações na Tabela
    - Adicionar coluna `fornecedor` (text) à tabela `itens_estoque`
    - Coluna opcional para armazenar nome do fornecedor do item

  2. Segurança
    - Manter RLS existente
    - Não alterar políticas de segurança
*/

-- Adicionar coluna fornecedor se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'itens_estoque' AND column_name = 'fornecedor'
  ) THEN
    ALTER TABLE itens_estoque ADD COLUMN fornecedor text;
  END IF;
END $$;