/*
  # Adicionar Estoque Nativo aos Itens
  
  1. Alterações
    - Adiciona coluna `estoque_nativo_id` na tabela `itens_estoque`
    - Permite que itens tenham um estoque principal/nativo
    - Útil para contagens e organização
  
  2. Notas
    - Campo opcional (nullable)
    - Referencia a tabela `estoques`
*/

-- Adicionar coluna estoque_nativo_id
ALTER TABLE itens_estoque 
ADD COLUMN IF NOT EXISTS estoque_nativo_id uuid REFERENCES estoques(id) ON DELETE SET NULL;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_itens_estoque_nativo ON itens_estoque(estoque_nativo_id);

-- Comentário na coluna
COMMENT ON COLUMN itens_estoque.estoque_nativo_id IS 'Estoque principal/nativo do item - útil para organização e contagens';
