/*
  # Fix Category Hierarchy Display

  1. Update View
    - Fix vw_categoria_tree to properly order categories hierarchically
    - Ensure parent categories appear before their children
    - Maintain proper sorting by type, then by hierarchy

  2. Ordering Logic
    - Sort by type (receita, despesa)
    - Then by parent category order
    - Then by child category order
    - Maintain hierarchical structure
*/

-- Drop and recreate the view with proper hierarchical ordering
DROP VIEW IF EXISTS vw_categoria_tree;

CREATE OR REPLACE VIEW vw_categoria_tree AS
WITH RECURSIVE categoria_hierarchy AS (
  -- Base case: root categories (no parent)
  SELECT 
    id,
    nome,
    tipo,
    categoria_pai_id,
    status,
    ordem,
    descricao,
    criado_em,
    0 as nivel,
    nome as caminho_completo,
    nome as nome_indentado,
    ARRAY[ordem] as sort_path
  FROM categorias_financeiras 
  WHERE categoria_pai_id IS NULL
  
  UNION ALL
  
  -- Recursive case: child categories
  SELECT 
    c.id,
    c.nome,
    c.tipo,
    c.categoria_pai_id,
    c.status,
    c.ordem,
    c.descricao,
    c.criado_em,
    ch.nivel + 1 as nivel,
    ch.caminho_completo || ' > ' || c.nome as caminho_completo,
    REPEAT('  ', ch.nivel + 1) || c.nome as nome_indentado,
    ch.sort_path || c.ordem
  FROM categorias_financeiras c
  INNER JOIN categoria_hierarchy ch ON c.categoria_pai_id = ch.id
)
SELECT 
  id,
  nome,
  tipo,
  categoria_pai_id,
  status,
  ordem,
  descricao,
  criado_em,
  nivel,
  caminho_completo,
  nome_indentado
FROM categoria_hierarchy
ORDER BY 
  tipo ASC,  -- receita first, then despesa
  sort_path; -- hierarchical order within each type