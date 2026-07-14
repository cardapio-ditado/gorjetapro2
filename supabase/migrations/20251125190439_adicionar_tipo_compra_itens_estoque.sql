/*
  # Adicionar campo tipo_compra aos itens de estoque

  ## Objetivo
  
  Diferenciar itens que são comprados na rua (feira, mercado, etc) 
  de itens comprados através de pedidos formais com fornecedores.
  
  ## Mudanças
  
  1. Adicionar coluna tipo_compra em itens_estoque
     - 'fornecedor': Compra formal com pedido e nota fiscal
     - 'rua': Compra na rua (feira, mercado, pequenos comércios)
     - 'ambos': Pode ser comprado de ambas as formas
  
  2. Adicionar campo fornecedor_padrao_id (opcional)
     - Para itens do tipo 'fornecedor', indica qual fornecedor normalmente fornece
  
  3. Valor padrão: 'ambos' para manter compatibilidade
*/

-- Adicionar colunas
ALTER TABLE itens_estoque 
ADD COLUMN IF NOT EXISTS tipo_compra text DEFAULT 'ambos' 
  CHECK (tipo_compra IN ('fornecedor', 'rua', 'ambos')),
ADD COLUMN IF NOT EXISTS fornecedor_padrao_id uuid REFERENCES fornecedores(id);

-- Comentários para documentação
COMMENT ON COLUMN itens_estoque.tipo_compra IS 
  'Define como o item é normalmente comprado: fornecedor (pedido formal), rua (compra avulsa) ou ambos';

COMMENT ON COLUMN itens_estoque.fornecedor_padrao_id IS 
  'Fornecedor padrão para itens comprados via pedido formal (tipo=fornecedor ou ambos)';

-- Criar índice para melhorar performance de filtros
CREATE INDEX IF NOT EXISTS idx_itens_estoque_tipo_compra 
  ON itens_estoque(tipo_compra);

CREATE INDEX IF NOT EXISTS idx_itens_estoque_fornecedor_padrao 
  ON itens_estoque(fornecedor_padrao_id);
