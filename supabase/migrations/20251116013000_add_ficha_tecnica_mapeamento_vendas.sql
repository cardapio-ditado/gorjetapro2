/*
  # Adicionar suporte a fichas técnicas no mapeamento de vendas

  1. Alterações
    - Adiciona coluna `ficha_tecnica_id` na tabela `mapeamento_itens_vendas`
    - Adiciona coluna `tipo_mapeamento` (item ou ficha_tecnica)
    - Permite que produtos sejam mapeados para fichas técnicas de venda direta

  2. Objetivo
    - Permitir que produtos importados sejam automaticamente mapeados para fichas técnicas
    - Diferenciar entre produtos simples e produtos com receita
*/

-- Adicionar colunas para suportar fichas técnicas
ALTER TABLE mapeamento_itens_vendas
ADD COLUMN IF NOT EXISTS ficha_tecnica_id uuid REFERENCES fichas_tecnicas(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS tipo_mapeamento text DEFAULT 'item' CHECK (tipo_mapeamento IN ('item', 'ficha_tecnica'));

-- Atualizar constraint para permitir item_estoque_id OR ficha_tecnica_id
ALTER TABLE mapeamento_itens_vendas
DROP CONSTRAINT IF EXISTS mapeamento_itens_vendas_check;

ALTER TABLE mapeamento_itens_vendas
ADD CONSTRAINT mapeamento_itens_vendas_check
CHECK (
  (tipo_mapeamento = 'item' AND item_estoque_id IS NOT NULL AND ficha_tecnica_id IS NULL) OR
  (tipo_mapeamento = 'ficha_tecnica' AND ficha_tecnica_id IS NOT NULL AND item_estoque_id IS NULL)
);

-- Criar índice para busca por ficha técnica
CREATE INDEX IF NOT EXISTS idx_mapeamento_itens_vendas_ficha
ON mapeamento_itens_vendas(ficha_tecnica_id)
WHERE ficha_tecnica_id IS NOT NULL;

-- Comentários
COMMENT ON COLUMN mapeamento_itens_vendas.ficha_tecnica_id IS 'Ficha técnica mapeada para este produto (quando tipo_mapeamento = ficha_tecnica)';
COMMENT ON COLUMN mapeamento_itens_vendas.tipo_mapeamento IS 'Tipo de mapeamento: item (produto simples) ou ficha_tecnica (produto com receita)';
