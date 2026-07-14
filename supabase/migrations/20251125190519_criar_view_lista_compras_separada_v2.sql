/*
  # Criar view para lista de compras separada por tipo

  ## Objetivo
  
  Facilitar a geração de listas de compras separadas:
  - Lista para compras na rua (feira, mercado)
  - Lista para pedidos de fornecedores
  
  ## Views Criadas
  
  1. vw_lista_compras_rua
     - Itens com estoque baixo que são comprados na rua
  
  2. vw_lista_compras_fornecedor
     - Itens com estoque baixo que são comprados de fornecedores
     - Agrupa por fornecedor padrão quando disponível
*/

-- View para compras na rua (feira, mercado)
CREATE OR REPLACE VIEW vw_lista_compras_rua AS
SELECT 
  ie.id,
  ie.codigo,
  ie.nome,
  ie.unidade_medida,
  ie.estoque_minimo,
  s.quantidade_atual,
  (ie.estoque_minimo - COALESCE(s.quantidade_atual, 0)) as quantidade_sugerida,
  ie.categoria,
  ie.tipo_compra,
  ie.observacoes,
  ie.custo_medio,
  ROUND((ie.estoque_minimo - COALESCE(s.quantidade_atual, 0)) * COALESCE(ie.custo_medio, 0), 2) as valor_estimado
FROM itens_estoque ie
LEFT JOIN saldos_estoque s ON s.item_id = ie.id
WHERE ie.status = 'ativo'
  AND ie.tipo_compra IN ('rua', 'ambos')
  AND COALESCE(s.quantidade_atual, 0) < ie.estoque_minimo
ORDER BY ie.categoria, ie.nome;

-- View para compras com fornecedores
CREATE OR REPLACE VIEW vw_lista_compras_fornecedor AS
SELECT 
  ie.id,
  ie.codigo,
  ie.nome,
  ie.unidade_medida,
  ie.estoque_minimo,
  s.quantidade_atual,
  (ie.estoque_minimo - COALESCE(s.quantidade_atual, 0)) as quantidade_sugerida,
  ie.categoria,
  ie.tipo_compra,
  ie.observacoes,
  ie.custo_medio,
  ROUND((ie.estoque_minimo - COALESCE(s.quantidade_atual, 0)) * COALESCE(ie.custo_medio, 0), 2) as valor_estimado,
  ie.fornecedor_padrao_id,
  f.nome as fornecedor_nome,
  f.telefone as fornecedor_telefone,
  f.email as fornecedor_email
FROM itens_estoque ie
LEFT JOIN saldos_estoque s ON s.item_id = ie.id
LEFT JOIN fornecedores f ON f.id = ie.fornecedor_padrao_id
WHERE ie.status = 'ativo'
  AND ie.tipo_compra IN ('fornecedor', 'ambos')
  AND COALESCE(s.quantidade_atual, 0) < ie.estoque_minimo
ORDER BY 
  COALESCE(f.nome, 'Sem fornecedor'), 
  ie.categoria, 
  ie.nome;

-- Comentários
COMMENT ON VIEW vw_lista_compras_rua IS 
  'Lista de itens com estoque baixo que precisam ser comprados na rua (feira, mercado)';

COMMENT ON VIEW vw_lista_compras_fornecedor IS 
  'Lista de itens com estoque baixo que precisam ser comprados de fornecedores, agrupados por fornecedor padrão';
